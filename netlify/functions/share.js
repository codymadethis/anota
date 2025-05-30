const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
  if (event.httpMethod === 'POST') {
    const { image, annotations } = JSON.parse(event.body);
    console.log('Received image data length:', image ? image.length : 'null');
    console.log('Received image data type:', typeof image);
    console.log('Received image data preview:', image ? image.substring(0, 100) + '...' : 'null');
    
    if (!image) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No image data provided' }),
        headers: { 'Access-Control-Allow-Origin': '*' }
      };
    }

    const { data, error } = await supabase
      .from('shares')
      .insert([{ image, annotations }])
      .select('id')
      .single();
    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
        headers: { 'Access-Control-Allow-Origin': '*' }
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ id: data.id }),
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  }
  if (event.httpMethod === 'GET') {
    const id = event.path.split('/').pop();
    const { data, error } = await supabase
      .from('shares')
      .select('image,annotations')
      .eq('id', id)
      .single();
    if (error || !data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Share not found' }),
        headers: { 'Access-Control-Allow-Origin': '*' }
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify(data),
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  }
  return { statusCode: 405, body: 'Method Not Allowed' };
};