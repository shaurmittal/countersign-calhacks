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
import type * as agents_ownerConcierge from "../agents/ownerConcierge.js";
import type * as agents_payer from "../agents/payer.js";
import type * as agents_riskAnalyst from "../agents/riskAnalyst.js";
import type * as agents_vendorVerifier from "../agents/vendorVerifier.js";
import type * as audit from "../audit.js";
import type * as cases from "../cases.js";
import type * as channels_agentBridge from "../channels/agentBridge.js";
import type * as channels_reply from "../channels/reply.js";
import type * as channels_sms from "../channels/sms.js";
import type * as channels_voice from "../channels/voice.js";
import type * as http from "../http.js";
import type * as lib_withAgentRun from "../lib/withAgentRun.js";
import type * as pipeline from "../pipeline.js";
import type * as scoreboard from "../scoreboard.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentRuns: typeof agentRuns;
  "agents/callbackVerifier": typeof agents_callbackVerifier;
  "agents/intake": typeof agents_intake;
  "agents/ownerConcierge": typeof agents_ownerConcierge;
  "agents/payer": typeof agents_payer;
  "agents/riskAnalyst": typeof agents_riskAnalyst;
  "agents/vendorVerifier": typeof agents_vendorVerifier;
  audit: typeof audit;
  cases: typeof cases;
  "channels/agentBridge": typeof channels_agentBridge;
  "channels/reply": typeof channels_reply;
  "channels/sms": typeof channels_sms;
  "channels/voice": typeof channels_voice;
  http: typeof http;
  "lib/withAgentRun": typeof lib_withAgentRun;
  pipeline: typeof pipeline;
  scoreboard: typeof scoreboard;
  seed: typeof seed;
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
