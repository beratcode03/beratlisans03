/**
 * Cloudflare Worker - Discord Webhook Proxy v2.1
 * Turk Telekom DPI bypass icin + Screenshot + Dosya destegi
 * 
 * KURULUM:
 * 1. Cloudflare Dashboard'a git
 * 2. Workers & Pages > berattt3 sec
 * 3. "Edit Code" tikla
 * 4. Bu kodu yapistir
 * 5. "Save and Deploy" tikla
 * 
 * DESTEKLENEN TIPLER:
 * - json: Normal JSON mesaj (varsayilan)
 * - screenshot: PNG goruntu (base64)
 * - file: TXT/dosya (base64, UTF-8 Turkce destegi)
 */

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === 'GET') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        message: 'Discord Webhook Proxy aktif',
        features: ['json', 'screenshot', 'file'],
        turkishSupport: true,
        version: '2.1.0'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (request.method === 'POST') {
      try {
        const url = new URL(request.url);
        const targetWebhook = url.searchParams.get('target');
        const requestType = url.searchParams.get('type') || 'json';

        if (!targetWebhook || !targetWebhook.startsWith('https://discord.com/api/webhooks/')) {
          return new Response(JSON.stringify({ error: 'Gecersiz webhook URL' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // SCREENSHOT veya FILE TYPE - Base64 dosyayi multipart/form-data'ya cevir
        if (requestType === 'screenshot' || requestType === 'file') {
          return await handleFileUpload(request, targetWebhook, corsHeaders, requestType);
        }

        // JSON TYPE - Normal JSON forward
        const body = await request.json();
        
        const discordResponse = await fetch(targetWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const responseText = await discordResponse.text();
        
        return new Response(responseText, {
          status: discordResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }
};

/**
 * Dosya/Screenshot isleme - Base64'u multipart/form-data'ya cevir
 * Turkce karakterler ve ozel semboller korunur (UTF-8)
 */
async function handleFileUpload(request, targetWebhook, corsHeaders, fileType) {
  try {
    const body = await request.json();
    const { embeds, username, attachments } = body;
    
    if (!attachments || !attachments[0] || !attachments[0].data) {
      return new Response(JSON.stringify({ error: 'Dosya verisi eksik' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const base64Data = attachments[0].data;
    const filename = attachments[0].filename || (fileType === 'screenshot' ? 'screenshot.png' : 'file.txt');
    const contentType = attachments[0].contentType || (fileType === 'screenshot' ? 'image/png' : 'text/plain; charset=utf-8');
    
    // Base64 decode
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Multipart form-data olustur
    const boundary = '----CloudflareWorkerBoundary' + Date.now();
    
    const payloadJson = JSON.stringify({
      embeds: embeds || [],
      username: username || 'YKS Takip Botu'
    });

    const parts = [];
    
    // Part 1: payload_json
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="payload_json"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      payloadJson + '\r\n'
    );
    
    // Part 2: file (binary)
    const fileHeader = 
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`;
    
    const fileFooter = `\r\n--${boundary}--\r\n`;

    const encoder = new TextEncoder();
    const headerBytes = encoder.encode(parts.join('') + fileHeader);
    const footerBytes = encoder.encode(fileFooter);

    const totalLength = headerBytes.length + bytes.length + footerBytes.length;
    const combined = new Uint8Array(totalLength);
    combined.set(headerBytes, 0);
    combined.set(bytes, headerBytes.length);
    combined.set(footerBytes, headerBytes.length + bytes.length);

    // Discord'a gonder
    const discordResponse = await fetch(targetWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLength.toString()
      },
      body: combined
    });

    const responseText = await discordResponse.text();
    
    if (discordResponse.ok) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: `${fileType === 'screenshot' ? 'Screenshot' : 'Dosya'} Discord'a gonderildi`,
        via: 'cloudflare-proxy',
        fileType: fileType
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: responseText,
        status: discordResponse.status
      }), {
        status: discordResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: `${fileType} isleme hatasi: ` + error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
