// HTTP routes. Public base URL: https://<deployment>.convex.site
import { httpRouter } from "convex/server";
import { getCaseStatus, recordCallbackOutcome, submitPaymentRequest } from "./channels/voice";
import { inboundMessage } from "./channels/agentBridge";

const http = httpRouter();

// P2: Cartesia webhook tools (see docs/cartesia-setup.md)
http.route({ path: "/cartesia/tools/submit-payment-request", method: "POST", handler: submitPaymentRequest });
http.route({ path: "/cartesia/tools/case-status", method: "POST", handler: getCaseStatus });
http.route({ path: "/cartesia/tools/callback-outcome", method: "POST", handler: recordCallbackOutcome });

// P4
http.route({ path: "/agent/message", method: "POST", handler: inboundMessage });

export default http;
