export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image } = req.body;
  if (!image) return res.status(400).json({ error: "Imagem não enviada" });

  const key = process.env.ANTHROPIC_KEY;
  if (!key) return res.status(500).json({ error: "Chave API não configurada no servidor" });

  const prompt = `Você está num sistema de rastreio de caminhões numa fábrica de cimento.
Analise esta foto e extraia a placa do veículo.
CONTEXTO: São caminhões pesados (truck, rodotrem, bitrem, carreta etc.)
A placa pode estar na frente ou traseira, suja, em ângulo, com reflexo ou pouca luz.
Placas brasileiras: 7 caracteres — formato antigo ABC1234 ou Mercosul ABC1D23.
INSTRUÇÕES:
1. Localize a placa na imagem
2. Leia os caracteres, mesmo que parcialmente visíveis
3. Se houver caractere duvidoso, dê seu melhor palpite
4. Responda SOMENTE em JSON válido: {"placa":"ABC1234","confianca":"alta|media|baixa","observacao":"texto curto"}
5. Se não encontrar: {"placa":null,"confianca":null,"observacao":"motivo"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errType = data?.error?.type || "";
      const errMsg  = data?.error?.message || "";
      if (response.status === 401 || errType === "invalid_api_key") {
        return res.status(401).json({ error: "Chave de API inválida", detail: errMsg });
      }
      if (response.status === 429 || errType === "rate_limit_error") {
        return res.status(429).json({ error: "Rate limit — aguarde e tente novamente", detail: errMsg });
      }
      return res.status(response.status).json({ error: "Erro da API: " + (errMsg || response.status) });
    }

    const txt = (data.content?.[0]?.text || "").trim();
    try {
      const clean = txt.replace(/```json|```/g, "").trim();
      return res.status(200).json(JSON.parse(clean));
    } catch(e) {
      const m = txt.match(/[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/);
      return res.status(200).json({ placa: m ? m[0] : null, confianca: "baixa", observacao: txt.slice(0, 120) });
    }
  } catch(err) {
    return res.status(500).json({ error: "Erro interno: " + err.message });
  }
}
