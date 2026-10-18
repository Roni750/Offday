import { loadEnv } from "commoneventframework";

const envReady = loadEnv();

import "./generated/HandlerRegistry";

import {
	APIGatewayProxyStructuredResultV2,
	Context,
	buildCommonEvent,
	getRouteConfig,
	resolveHandlerRef,
	Response,
	setLambdaContext,
	startDevServer
} from "commoneventframework";
import { CommonEvent, LambdaEvent } from "commoneventframework/dist/types/commonEvent";
import { HandlerFn, InputParserFn } from "./handlers/types";
import { NotFoundError } from "./core/errors";
import { toErrorResponse } from "./http/respond";

// CEF built-ins that expose runtime metadata; kept for local debugging, hidden on Lambda.
const LOCAL_ONLY_ROUTES = new Set(["/context", "/dependencies"]);
const isLambda = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

// Invitation responses carry a one-time link token, a fresh session or an account's details: never cache them.
const NO_STORE_PATH = /\/invitations(\/|$)/;
const withCachePolicy = (event: CommonEvent, response: APIGatewayProxyStructuredResultV2): APIGatewayProxyStructuredResultV2 => {
	if (NO_STORE_PATH.test(event.path)) response.headers = { ...response.headers, "Cache-Control": "no-store" };
	return response;
};

export const handler = async (
	event: LambdaEvent,
	context: Context
): Promise<APIGatewayProxyStructuredResultV2> => {
	await envReady;
	await setLambdaContext(context);
	const commonEvent: CommonEvent = await buildCommonEvent(event);

	// CEF's dev server answers CORS preflight itself; on Lambda it reaches this handler.
	if (commonEvent.method === "OPTIONS") {
		return new Response(204, {});
	}

	return withCachePolicy(commonEvent, await route(commonEvent));
};

const route = async (commonEvent: CommonEvent): Promise<APIGatewayProxyStructuredResultV2> => {
	try {
		const routeConfig = getRouteConfig(commonEvent);

		if (!routeConfig || !routeConfig.handler || (isLambda() && LOCAL_ONLY_ROUTES.has(commonEvent.path))) {
			throw new NotFoundError("Route not found");
		}

		const handlerFn = resolveHandlerRef(routeConfig.handler) as HandlerFn | undefined;
		const parserFn = routeConfig.inputParser
			? resolveHandlerRef(routeConfig.inputParser) as InputParserFn | undefined
			: undefined;

		if (!handlerFn) {
			throw new Error(`Handler "${routeConfig.handler}" not registered`);
		}

		// inputParsers may throw DomainErrors (validation, authentication); they're mapped below.
		const input = parserFn ? parserFn(commonEvent) : {};
		if (input instanceof Response) return input;

		const result = await handlerFn(input, commonEvent);

		if (result && 'statusCode' in result) {
			return result as APIGatewayProxyStructuredResultV2;
		}
		return new Response(200, result as object);
	} catch (err) {
		return toErrorResponse(err);
	}
};

if (process.argv.includes("--local")) {
	startDevServer(handler);
}
