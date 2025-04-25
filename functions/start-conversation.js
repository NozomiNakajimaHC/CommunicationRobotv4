const { OpenAI } = require('openai');

exports.handler = async function(event, context) {
  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // POSTリクエストのみ処理
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // OpenAI APIクライアントの初期化
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    

    // セッションIDを生成（実際のシステムではより複雑な実装が必要）
    const sessionId = Date.now().toString();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        sessionId: sessionId,
        message: 'Session initialized. Ready for WebRTC connection.'
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
