// HTTP routes. Public base URL: https://<deployment>.convex.site
import { httpRouter } from "convex/server";
import { inbound as smsInbound } from "./channels/sms";
import { callbackStatus, cartesiaTools, inboundCall } from "./channels/voice";
import { inboundMessage } from "./channels/agentBridge";

const http = httpRouter();

// P2
http.route({ path: "/twilio/sms", method: "POST", handler: smsInbound });
http.route({ path: "/twilio/voice", method: "POST", handler: inboundCall });
http.route({ path: "/twilio/callback-status", method: "POST", handler: callbackStatus });
http.route({ path: "/cartesia/tools", method: "POST", handler: cartesiaTools });

// P4
http.route({ path: "/agent/message", method: "POST", handler: inboundMessage });

export default http;
