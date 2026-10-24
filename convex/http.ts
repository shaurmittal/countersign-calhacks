// HTTP routes. Public base URL: https://<deployment>.convex.site
import { httpRouter } from "convex/server";
import { getCaseStatus, recordCallbackOutcome, submitPaymentRequest } from "./channels/voice";
import { caseStatus, inboundMessage, ownerApproval, pendingApprovals } from "./channels/agentBridge";

const http = httpRouter();

// P2: Cartesia webhook tools (see docs/cartesia-setup.md)
http.route({ path: "/cartesia/tools/submit-payment-request", method: "POST", handler: submitPaymentRequest });
http.route({ path: "/cartesia/tools/case-status", method: "POST", handler: getCaseStatus });
http.route({ path: "/cartesia/tools/callback-outcome", method: "POST", handler: recordCallbackOutcome });

// P4
http.route({ path: "/agent/message", method: "POST", handler: inboundMessage });
http.route({ path: "/agent/case", method: "GET", handler: caseStatus });
http.route({ path: "/agent/pending", method: "GET", handler: pendingApprovals });
http.route({ path: "/agent/approval", method: "POST", handler: ownerApproval });

export default http;
