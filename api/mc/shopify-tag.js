export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g. your-store.myshopify.com
    const SHOPIFY_ADMIN_TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN;  // shpat_...
    const MANYCHAT_SHARED_SECRET = process.env.MANYCHAT_SHARED_SECRET || "";

    // --- Signature check (ManyChat → Headers: X-Signature) ---
    const sig = req.headers["x-signature"] || "";
    if (MANYCHAT_SHARED_SECRET && sig !== MANYCHAT_SHARED_SECRET) {
      return res.status(401).json({ error: "invalid_signature" });
    }

    // Body
    const { email, tag } = req.body || {};
    if (!email || !tag) {
      return res.status(400).json({ error: "email_and_tag_required" });
    }

    // Common headers for Shopify Admin API
    const headers = {
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
    };

    // 1) 고객 이메일로 검색
    const searchUrl =
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/customers/search.json` +
      `?query=${encodeURIComponent("email:" + email)}`;

    const searchResp = await fetch(searchUrl, { headers });
    if (!searchResp.ok) {
      const detail = await searchResp.text();
      return res.status(searchResp.status).json({ error: "shopify_search_failed", detail });
    }
    const searchData = await searchResp.json();
    const customers = searchData.customers || [];
    if (customers.length === 0) {
      return res.status(404).json({ error: "customer_not_found_for_email" });
    }

    // 검색 결과 첫 고객 대상으로 처리
    const customer = customers[0];
    const id = customer.id;

    // 기존 태그 + 신규 태그 병합 (중복 방지)
    const existing = (customer.tags || "")
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);
    if (!existing.includes(tag)) existing.push(tag);
    const tagsString = existing.join(", ");

    // 2) 고객 태그 업데이트
    const updateUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/customers/${id}.json`;
    const updateResp = await fetch(updateUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({ customer: { id, tags: tagsString } }),
    });

    if (!updateResp.ok) {
      const detail = await updateResp.text();
      return res.status(updateResp.status).json({ error: "shopify_update_failed", detail });
    }

    return res.status(200).json({ ok: true, customer_id: id, tags: tagsString });
  } catch (err) {
    return res.status(500).json({ error: "server_error", detail: String(err) });
  }
}
