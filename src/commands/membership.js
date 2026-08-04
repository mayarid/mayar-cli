const api = require('../api');
const ui = require('../ui');
const { checkResp, readData, pagination, cursorFooter } = require('../util');

const USAGE = 'Usage: mayar membership <members|tiers|product|tier|register|get|update|cancel|create-invoice>';

/*
 * ENDPOINT CONTRACT — membership product & tier write/get (Headless v2 wrappers)
 * ----------------------------------------------------------------------------
 * These four endpoints are the FIXED build contract for the
 * `membership product` and `membership tier` sub-namespaces. They are new
 * Headless v2 wrapper endpoints to be implemented in api-custom-paymenlink
 * (based on the existing dashboard GraphQL mutations) — they are NOT inferred
 * from the public REST docs. Subsequent tasks implement against these exact
 * paths and bodies verbatim. `?` marks an optional field.
 *
 * (1) POST /hl/v2/memberships/products/create
 *     Body: {
 *       name,
 *       description,
 *       redirectUrl?,
 *       coverImage?,
 *       hidePortalAccessInEmails?,
 *       membershipInfo: {
 *         showMembers,
 *         type,            // enum: MEMBERSHIP | SAAS | CREDIT (uppercase)
 *         creditValue?,
 *         enableCreditTopup?,
 *         isAccumulateCredit?,
 *         isAccumulateTopupCredit?,
 *         minCreditTopup?,
 *         maxCreditTopup?
 *       }
 *     }
 *
 * (2) GET /hl/v2/memberships/products/:productId
 *     (may wrap/reuse existing product detail logic)
 *
 * (3) POST /hl/v2/memberships/tiers/create
 *     Body: {
 *       productId,
 *       name,
 *       description,
 *       notes?,
 *       limit?,
 *       upfrontFee?,
 *       finishMembershipAt?,
 *       gracePeriodInDays?,
 *       trialPeriodInDays?,
 *       trialCredit?,
 *       isTrialAvailable?,
 *       redirectUrl?,
 *       periods: [
 *         { monthPeriod?, amount?, credit?, isLifetime?, status? }
 *       ]
 *     }
 *
 * (4) GET /hl/v2/memberships/tiers/:tierId?productId=...
 *     (or filter existing GET /hl/v2/memberships/tiers?productId=...)
 *
 * DISPATCH KEYS — `product` and `tier` (singular) are NEW switch cases.
 * They do NOT collide with the existing cases:
 *   members, tiers (plural — the tier LIST command), register,
 *   get/detail, update, cancel, create-invoice/createinvoice/invoice.
 * Note the distinction: existing plural `tiers` lists tiers for a product;
 * the new singular `tier` sub-namespace handles single-tier create/get.
 */

async function run({ apiKey, flags, positional }) {
  const [sub, ...rest] = positional;
  switch (sub) {
    case 'members': {
      if (!flags.productId) throw new Error('mayar membership members requires --productId <id>');
      const res = await api.request('GET', '/hl/v2/memberships/members', {
        apiKey, query: pagination(flags, { productId: flags.productId }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const data = (res.body && res.body.data) || [];
      const rows = data.map((m) => ({
        id: m.id,
        customer: (m.customer && (m.customer.name || m.customer.email)) || '',
        tier: (m.membershipTier && m.membershipTier.name) || m.membershipTierId || '',
        period: m.membershipMonthlyPeriod ?? '',
        status: m.status || '',
      }));
      ui.table(rows, ['id', 'customer', 'tier', 'period', 'status']);
      cursorFooter(res.body, data.length);
      return;
    }
    case 'tiers': {
      if (!flags.productId) throw new Error('mayar membership tiers requires --productId <id>');
      const res = await api.request('GET', '/hl/v2/memberships/tiers', {
        apiKey, query: pagination(flags, { productId: flags.productId }),
      });
      checkResp(res);
      if (flags.json) return ui.jsonOut(res.body);
      const data = (res.body && res.body.data) || [];
      const rows = data.map((t) => ({
        id: t.id, name: t.name, amount: t.amount, status: t.status,
      }));
      ui.table(rows, ['id', 'name', 'amount', 'status']);
      cursorFooter(res.body, data.length);
      return;
    }
    case 'register': {
      const body = readData(flags.data);
      if (!body) throw new Error('mayar membership register requires --data <json|@file>');
      const res = await api.request('POST', '/hl/v2/memberships/members/create', { apiKey, body });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'get':
    case 'detail': {
      if (!rest[0]) throw new Error('Usage: mayar membership get <memberId> --productId <id>');
      if (!flags.productId) throw new Error('mayar membership get requires --productId <id>');
      const res = await api.request('GET', `/hl/v2/memberships/members/${encodeURIComponent(rest[0])}`, {
        apiKey, query: { productId: flags.productId },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'update': {
      if (!rest[0]) throw new Error('Usage: mayar membership update <memberId> --productId <id> [--data <json|@file>]');
      if (!flags.productId) throw new Error('mayar membership update requires --productId <id>');
      const body = readData(flags.data) || {};
      body.productId = body.productId || flags.productId;
      const res = await api.request('POST', `/hl/v2/memberships/members/${encodeURIComponent(rest[0])}/update`, {
        apiKey, body,
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'cancel': {
      if (!rest[0]) throw new Error('Usage: mayar membership cancel <memberId> --productId <id>');
      if (!flags.productId) throw new Error('mayar membership cancel requires --productId <id>');
      const res = await api.request('POST', `/hl/v2/memberships/members/${encodeURIComponent(rest[0])}/cancel`, {
        apiKey, body: { productId: flags.productId },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'create-invoice':
    case 'createinvoice':
    case 'invoice': {
      if (!rest[0]) throw new Error('Usage: mayar membership create-invoice <memberId> --productId <id>');
      if (!flags.productId) throw new Error('mayar membership create-invoice requires --productId <id>');
      const res = await api.request('POST', `/hl/v2/memberships/members/${encodeURIComponent(rest[0])}/invoice/create`, {
        apiKey, body: { productId: flags.productId },
      });
      checkResp(res); ui.jsonOut(res.body); return;
    }
    case 'product': {
      const action = rest[0];
      switch (action) {
        case 'create': {
          const body = readData(flags.data);
          if (!body) throw new Error('mayar membership product create requires --data <json|@file>');
          const res = await api.request('POST', '/hl/v2/memberships/products/create', { apiKey, body });
          checkResp(res); ui.jsonOut(res.body); return;
        }
        case 'get': {
          const productId = rest[1];
          if (!productId) throw new Error('Usage: mayar membership product get <productId>');
          const res = await api.request('GET', `/hl/v2/memberships/products/${encodeURIComponent(productId)}`, { apiKey });
          checkResp(res); ui.jsonOut(res.body); return;
        }
        default:
          throw new Error('Usage: mayar membership product <create|get>');
      }
    }
    case 'tier': {
      const action = rest[0];
      switch (action) {
        case 'create': {
          const body = readData(flags.data);
          if (!body) throw new Error('mayar membership tier create requires --data <json|@file>');
          const res = await api.request('POST', '/hl/v2/memberships/tiers/create', { apiKey, body });
          checkResp(res); ui.jsonOut(res.body); return;
        }
        case 'get': {
          const tierId = rest[1];
          if (!tierId) throw new Error('Usage: mayar membership tier get <tierId> --productId <id>');
          if (!flags.productId) throw new Error('mayar membership tier get requires --productId <id>');
          const res = await api.request('GET', `/hl/v2/memberships/tiers/${encodeURIComponent(tierId)}`, {
            apiKey, query: { productId: flags.productId },
          });
          checkResp(res); ui.jsonOut(res.body); return;
        }
        default:
          throw new Error('Usage: mayar membership tier <create|get>');
      }
    }
    default:
      throw new Error(USAGE);
  }
}

module.exports = { run };
