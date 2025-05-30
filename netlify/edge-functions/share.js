// trigger redeploy
// Netlify Edge Function for sharing annotations
export const config = { path: ["/api/share", "/api/share/*"] };

export default async (request, context) => {
  // Handle CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Handle POST request for creating a share
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      console.log('POST body:', body);

      const { image, annotations } = body;
      if (!image || !annotations) {
        console.log('Missing image or annotations');
        throw new Error('Missing image or annotations');
      }
      
      // Generate a short ID (6 characters)
      const id = Math.random().toString(36).substring(2, 8);
      
      // Store in KV store (Netlify's built-in key-value store)
      await context.store.set(id, JSON.stringify({ image, annotations }), {
        expirationTtl: 60 * 60 * 24 * 7, // 7 days
      });

      console.log('Stored share with id:', id);

      return new Response(JSON.stringify({ id }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.log('Error in POST /api/share:', error);
      return new Response(JSON.stringify({ error: 'Failed to create share' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }

  // Handle GET request for retrieving a share
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();

    if (!id) {
      return new Response(JSON.stringify({ error: 'Share ID required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    try {
      const data = await context.store.get(id);
      
      if (!data) {
        return new Response(JSON.stringify({ error: 'Share not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      return new Response(data, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to retrieve share' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }

  // Handle unsupported methods
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}; 