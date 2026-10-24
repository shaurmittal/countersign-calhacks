/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentRuns from "../agentRuns.js";
import type * as agents_callbackVerifier from "../agents/callbackVerifier.js";
import type * as agents_intake from "../agents/intake.js";
import type * as agents_moss from "../agents/moss.js";
import type * as agents_ownerConcierge from "../agents/ownerConcierge.js";
import type * as agents_payer from "../agents/payer.js";
import type * as agents_riskAnalyst from "../agents/riskAnalyst.js";
import type * as agents_vendorVerifier from "../agents/vendorVerifier.js";
import type * as audit from "../audit.js";
import type * as callbacks from "../callbacks.js";
import type * as cases from "../cases.js";
import type * as channels_agentBridge from "../channels/agentBridge.js";
import type * as channels_reply from "../channels/reply.js";
import type * as channels_voice from "../channels/voice.js";
import type * as channels_web from "../channels/web.js";
import type * as channels_whatsapp from "../channels/whatsapp.js";
import type * as http from "../http.js";
import type * as lib_cartesia from "../lib/cartesia.js";
import type * as lib_caseView from "../lib/caseView.js";
import type * as lib_claude from "../lib/claude.js";
import type * as lib_increase from "../lib/increase.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_riskExplanation from "../lib/riskExplanation.js";
import type * as lib_whatsapp from "../lib/whatsapp.js";
import type * as lib_withAgentRun from "../lib/withAgentRun.js";
import type * as owner from "../owner.js";
import type * as payments from "../payments.js";
import type * as pipeline from "../pipeline.js";
import type * as privacy from "../privacy.js";
import type * as scoreboard from "../scoreboard.js";
import type * as seed from "../seed.js";
import type * as senderLists from "../senderLists.js";
import type * as warRoom from "../warRoom.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentRuns: typeof agentRuns;
  "agents/callbackVerifier": typeof agents_callbackVerifier;
  "agents/intake": typeof agents_intake;
  "agents/moss": typeof agents_moss;
  "agents/ownerConcierge": typeof agents_ownerConcierge;
  "agents/payer": typeof agents_payer;
  "agents/riskAnalyst": typeof agents_riskAnalyst;
  "agents/vendorVerifier": typeof agents_vendorVerifier;
  audit: typeof audit;
  callbacks: typeof callbacks;
  cases: typeof cases;
  "channels/agentBridge": typeof channels_agentBridge;
  "channels/reply": typeof channels_reply;
  "channels/voice": typeof channels_voice;
  "channels/web": typeof channels_web;
  "channels/whatsapp": typeof channels_whatsapp;
  http: typeof http;
  "lib/cartesia": typeof lib_cartesia;
  "lib/caseView": typeof lib_caseView;
  "lib/claude": typeof lib_claude;
  "lib/increase": typeof lib_increase;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/riskExplanation": typeof lib_riskExplanation;
  "lib/whatsapp": typeof lib_whatsapp;
  "lib/withAgentRun": typeof lib_withAgentRun;
  owner: typeof owner;
  payments: typeof payments;
  pipeline: typeof pipeline;
  privacy: typeof privacy;
  scoreboard: typeof scoreboard;
  seed: typeof seed;
  senderLists: typeof senderLists;
  warRoom: typeof warRoom;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
