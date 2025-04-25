// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const path = require('path');

// 環境変数の読み込み
dotenv.config();

// Express アプリの設定
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// OpenAI APIクライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 静的ファイルのサービング
app.use(express.static(path.join(__dirname, 'public')));

// ルート
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebRTCシグナリングサーバー
let peers = {};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  peers[socket.id] = { socket };

  // シグナリングメッセージの処理
  socket.on('signal', (data) => {
    console.log('Signal received from client:', socket.id);
    // OpenAIのWebRTC接続を処理する（後で実装）
    handleOpenAIConnection(socket, data);
  });

  // 会話開始のリクエスト
  socket.on('startConversation', async () => {
    console.log('Conversation start requested by client:', socket.id);
    
    try {
      // OpenAIのリアルタイム音声ストリームを開始
      const streamConnection = await startOpenAIStream(socket);
      peers[socket.id].streamConnection = streamConnection;
      
      socket.emit('conversationStarted');
    } catch (error) {
      console.error('Error starting conversation:', error);
      socket.emit('error', { message: 'Failed to start conversation' });
    }
  });

  // 会話終了のリクエスト
  socket.on('stopConversation', () => {
    console.log('Conversation stop requested by client:', socket.id);
    if (peers[socket.id] && peers[socket.id].streamConnection) {
      // OpenAIのストリームを停止
      stopOpenAIStream(peers[socket.id].streamConnection);
      delete peers[socket.id].streamConnection;
    }
  });

  // クライアント切断時の処理
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (peers[socket.id] && peers[socket.id].streamConnection) {
      stopOpenAIStream(peers[socket.id].streamConnection);
    }
    delete peers[socket.id];
  });
});

// OpenAIのWebRTC接続を処理する関数
// OpenAIのWebRTC接続を処理する関数
async function handleOpenAIConnection(socket, signalData) {
  try {
    console.log("WebRTC signal received, bypassing direct WebRTC connection");
    // 代替アプローチとして、従来の音声認識を使用
    socket.emit('signal', { type: 'answer', sdp: 'dummy' });
  } catch (error) {
    console.error('Error in OpenAI WebRTC connection:', error);
    socket.emit('error', { message: 'WebRTC connection failed' });
  }
}

// OpenAIのリアルタイム音声ストリームを開始する関数
async function startOpenAIStream(socket) {
  try {
    // OpenAIのリアルタイム音声APIを呼び出す
    const stream = await openai.audio.realtime.connect({
      model: "whisper-1", // OpenAIの音声モデル
      voice: "alloy",  // TTS音声
      webrtc_url: process.env.OPENAI_WEBRTC_URL || undefined,
      on_message: (message) => {
        // 音声認識の結果をクライアントに送信
        if (message.type === 'transcript') {
          const userText = message.text;
          console.log('User transcript:', userText);
          
          // ユーザーの発言をGPTに処理させる
          processWithGPT(userText, socket);
        }
      },
      on_status: (status) => {
        console.log('Stream status:', status);
        socket.emit('streamStatus', status);
      },
      on_close: () => {
        console.log('Stream closed');
        socket.emit('streamClosed');
      },
      on_error: (error) => {
        console.error('Stream error:', error);
        socket.emit('error', { message: 'Stream error' });
      }
    });
    
    return stream;
  } catch (error) {
    console.error('Error starting OpenAI stream:', error);
    throw error;
  }
}

// OpenAIのリアルタイム音声ストリームを停止する関数
function stopOpenAIStream(stream) {
  if (stream && typeof stream.close === 'function') {
    stream.close();
  }
}

// ユーザーの発言をGPTで処理する関数
async function processWithGPT(userText, socket) {
  try {
    // ユーザーの発言が無効な場合はスキップ
    if (!userText || userText.trim() === '') return;
    
    // GPTに質問を送信
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "あなたは親切なAIアシスタントです。短く簡潔に応答してください。" },
        { role: "user", content: userText }
      ],
      max_tokens: 150
    });
    
    const aiResponse = completion.choices[0].message.content;
    console.log('AI response:', aiResponse);
    
    // 音声合成でAIの応答を読み上げる
    const audioResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: aiResponse
    });
    
    // 音声データをArrayBufferに変換
    const buffer = await audioResponse.arrayBuffer();
    
    // WebRTC経由でクライアントに送信
    if (peers[socket.id] && peers[socket.id].streamConnection) {
      peers[socket.id].streamConnection.send(buffer);
    }
    
    // テキスト形式でもレスポンスを送信
    socket.emit('aiResponse', {
      type: 'transcript',
      text: aiResponse,
      duration: calculateSpeakingDuration(aiResponse) * 1000 // ミリ秒単位
    });
    
  } catch (error) {
    console.error('Error processing with GPT:', error);
    socket.emit('error', { message: 'Failed to process your request' });
  }
}

// 発話時間を計算する関数（大雑把な見積もり）
function calculateSpeakingDuration(text) {
  // 平均的な話す速度: 日本語で1分間に約350文字
  const charactersPerSecond = 350 / 60;
  return Math.max(2, text.length / charactersPerSecond);
}

// サーバーの起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
