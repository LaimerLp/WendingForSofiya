/**
 * Cloudflare Worker для тихой отправки выбора свидания в Telegram.
 * Переменные окружения (Secrets) в настройках Worker:
 *   BOT_TOKEN — токен вашего бота от @BotFather
 *   CHAT_ID   — ваш числовой Telegram ID (можно узнать у @userinfobot)
 */
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const { text } = await request.json();
      if (!text || typeof text !== "string" || text.length > 3500) {
        return new Response("Bad Request", { status: 400, headers: corsHeaders });
      }

      const tgUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
      const tgResp = await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.CHAT_ID,
          text
        })
      });

      if (!tgResp.ok) {
        const errText = await tgResp.text();
        return new Response(errText, { status: 502, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response("Internal Error", { status: 500, headers: corsHeaders });
    }
  }
};
