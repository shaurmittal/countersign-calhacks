// HTTP routes. Public base URL: https://<deployment>.convex.site
import { httpRouter } from "convex/server";
import { getCaseStatus, lookupPolicy, recordCallbackOutcome, submitPaymentRequest } from "./channels/voice";
import { caseStatus, inboundMessage, ownerApproval, pendingApprovals } from "./channels/agentBridge";
import { receiveWebhook, verifyWebhook } from "./channels/whatsapp";

const http = httpRouter();

// P2: Cartesia webhook tools (see docs/cartesia-setup.md)
http.route({ path: "/cartesia/tools/submit-payment-request", method: "POST", handler: submitPaymentRequest });
http.route({ path: "/cartesia/tools/case-status", method: "POST", handler: getCaseStatus });
http.route({ path: "/cartesia/tools/callback-outcome", method: "POST", handler: recordCallbackOutcome });
http.route({ path: "/cartesia/tools/policy", method: "POST", handler: lookupPolicy }); // both agents; Moss, capped at 2 s

// P2: WhatsApp Cloud API webhook (see docs/whatsapp-setup.md)
http.route({ path: "/whatsapp/webhook", method: "GET", handler: verifyWebhook });
http.route({ path: "/whatsapp/webhook", method: "POST", handler: receiveWebhook });

// P4
http.route({ path: "/agent/message", method: "POST", handler: inboundMessage });
http.route({ path: "/agent/case", method: "GET", handler: caseStatus });
http.route({ path: "/agent/pending", method: "GET", handler: pendingApprovals });
http.route({ path: "/agent/approval", method: "POST", handler: ownerApproval });

export default http;
