# Spec Implementasi Backend — Membership Product & Tier Write/Get

Target repo: **`api-custom-paymenlink`** (Headless v2 wrappers)
Konsumen: `mayar-cli` — sub-command `membership product` & `membership tier`.

CLI-nya udah selesai & lolos test. Yang kurang cuma 4 endpoint di bawah ini.
Selama belum ada, CLI balikin `API 404 — Not Found`.

---

## Aturan umum (harus dipatuhi semua endpoint)

- **Auth**: CLI ngirim header `Authorization: Bearer <apiKey>`. Pakai
  middleware auth API-key yang sama dengan endpoint `/hl/v2/*` lain.
- **Content-Type**: request POST → `application/json`. Response → JSON.
- **Base path**: semua di bawah prefix `/hl/v2/memberships/...`.
- **Sumber logic**: ini **wrapper** di atas **GraphQL mutation dashboard yang
  udah ada** (create product / create tier). Jangan bikin logic dari nol —
  bungkus mutation eksisting jadi REST. GET boleh reuse product/tier detail
  resolver yang udah ada.
- **Body field harus verbatim** sesuai contract di bawah. CLI ngirim apa adanya
  dari `--data`; kalau nama field beda, mismatch.

---

## (1) POST `/hl/v2/memberships/products/create`

Bikin membership product baru.

**Request body:**
```jsonc
{
  "name": "string",                       // wajib
  "description": "string",                // wajib
  "redirectUrl": "string",                // opsional
  "coverImage": "string",                 // opsional
  "hidePortalAccessInEmails": false,      // opsional (bool)
  "membershipInfo": {                     // wajib (object)
    "showMembers": true,                  // wajib (bool)
    "type": "string",                     // wajib (enum tipe membership)
    "creditValue": 0,                     // opsional
    "enableCreditTopup": false,           // opsional
    "isAccumulateCredit": false,          // opsional
    "isAccumulateTopupCredit": false,     // opsional
    "minCreditTopup": 0,                  // opsional
    "maxCreditTopup": 0                   // opsional
  }
}
```

**Response**: object product yang baru dibuat (minimal ada `id`, biar bisa
dipakai buat `tier create` & `product get`).

**Mapping ke dashboard**: samain sama GraphQL mutation create product yang
dipakai dashboard. `membershipInfo` biasanya nge-map ke field product +
konfigurasi credit.

---

## (2) GET `/hl/v2/memberships/products/:productId`

Ambil detail satu product.

- Param path: `productId`. CLI meng-`encodeURIComponent` id-nya (mis. `a b/c`
  jadi `a%20b%2Fc`), jadi decode di router.
- **Tanpa query param** (scoping productId khusus tier, bukan product).
- Boleh reuse/wrap logic product detail yang udah ada.

**Response**: object product.

---

## (3) POST `/hl/v2/memberships/tiers/create`

Bikin tier baru di bawah sebuah product.

**Request body:**
```jsonc
{
  "productId": "string",                  // wajib
  "name": "string",                       // wajib
  "description": "string",                // wajib
  "notes": "string",                      // opsional
  "limit": 0,                             // opsional
  "upfrontFee": 0,                        // opsional
  "finishMembershipAt": "string",         // opsional
  "gracePeriodInDays": 0,                 // opsional
  "trialPeriodInDays": 0,                 // opsional
  "trialCredit": 0,                       // opsional
  "isTrialAvailable": false,              // opsional
  "redirectUrl": "string",                // opsional
  "periods": [                            // wajib (array), tiap item:
    {
      "monthPeriod": 0,                   // opsional
      "amount": 0,                        // opsional
      "credit": 0,                        // opsional
      "isLifetime": false,                // opsional
      "status": "string"                  // opsional
    }
  ]
}
```

**Response**: object tier yang baru dibuat (minimal `id`).

**Mapping ke dashboard**: samain sama GraphQL mutation create tier. `periods[]`
= pilihan durasi + harga tier (mis. bulanan/tahunan/lifetime).

---

## (4) GET `/hl/v2/memberships/tiers/:tierId?productId=...`

Ambil detail satu tier.

- Param path: `tierId` (di-`encodeURIComponent` juga oleh CLI).
- **Query wajib**: `productId` — CLI selalu ngirim ini. Boleh dipakai buat
  scoping/validasi kepemilikan tier.
- Alternatif implementasi (kalau lebih gampang): filter dari GET
  `/hl/v2/memberships/tiers?productId=...` yang eksisting.

**Response**: object tier.

---

## Ekspektasi error (biar konsisten sama CLI)

- Product/tier gak ketemu → `404`.
- Body invalid / field wajib kosong → `400`.
- Auth gagal → `401`.
CLI cuma nampilin `API <status> — <message>`, jadi pastiin `message` jelas.

---

## Cara verifikasi setelah endpoint jadi

Dari CLI (branch `feat/membership-product-tier-write`):

```bash
# arahkan ke env kamu (staging/lokal)
export MAYAR_API_KEY=xxxxx
export MAYAR_API_URL=https://<host-backend>

node bin/mayar.js membership product create \
  --data '{"name":"Pro","description":"Paket pro","membershipInfo":{"showMembers":true,"type":"finite"}}'

node bin/mayar.js membership product get <productId>

node bin/mayar.js membership tier create --data @tier.json
node bin/mayar.js membership tier get <tierId> --productId <productId>
```

Kalau 4 command ini balikin JSON (bukan 404), berarti wrapper-nya udah nyambung
end-to-end dengan CLI.

---

## Checklist implementasi

- [ ] Route `POST /hl/v2/memberships/products/create` → mutation create product
- [ ] Route `GET  /hl/v2/memberships/products/:productId` → product detail
- [ ] Route `POST /hl/v2/memberships/tiers/create` → mutation create tier
- [ ] Route `GET  /hl/v2/memberships/tiers/:tierId?productId=` → tier detail
- [ ] Pasang auth middleware API-key (Bearer) yang sama dgn `/hl/v2/*`
- [ ] Validasi field wajib (name, description, membershipInfo / productId, periods)
- [ ] Decode path param (encodeURIComponent dari CLI)
- [ ] Response sertakan `id` di create (buat chaining)
- [ ] Smoke test pakai 4 command CLI di atas
