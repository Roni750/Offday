// Builds the CEF bundle and deploys it to AWS Lambda behind a public Function URL.
// Usage: npm run deploy   (requires AWS CLI credentials and backend/.env.lambda)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FUNCTION_NAME = "vacation-manager-api";
const ROLE_NAME = "vacation-manager-lambda-role";
const RUNTIME = "nodejs22.x";
const AWS_BIN = existsSync("C:/Program Files/Amazon/AWSCLIV2/aws.exe")
	? "C:/Program Files/Amazon/AWSCLIV2/aws.exe"
	: "aws";

const aws = (...args) => execFileSync(AWS_BIN, args, { encoding: "utf8" }).trim();
// For existence checks: a "not found" error is an expected answer, so stderr is silenced.
const tryAws = (...args) => {
	try {
		return execFileSync(AWS_BIN, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return null;
	}
};

const parseEnvFile = (path) =>
	Object.fromEntries(
		readFileSync(path, "utf8")
			.split(/\r?\n/)
			.filter((line) => line && !line.startsWith("#") && line.includes("="))
			.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
	);

// Percent-encode the password so characters like "/" or "?" don't break URL parsing.
const encodeDbPassword = (url) => {
	const [scheme, rest] = url.split("://");
	const at = rest.lastIndexOf("@");
	const [user, ...pw] = rest.slice(0, at).split(":");
	const password = pw.join(":");
	const encoded = /%[0-9A-Fa-f]{2}/.test(password) ? password : encodeURIComponent(password);
	return `${scheme}://${user}:${encoded}@${rest.slice(at + 1)}`;
};

if (!existsSync(".env.lambda")) {
	console.error("Missing backend/.env.lambda (see .env.lambda.example)");
	process.exit(1);
}

const env = parseEnvFile(".env.lambda");
env.DATABASE_URL = encodeDbPassword(env.DATABASE_URL);
env.DB_CA_CERT = readFileSync("certs/supabase-ca.crt", "utf8").trim();
// One request per container at a time, and Supabase limits pooler connections.
env.DB_POOL_MAX ??= "2";

const envFile = join(tmpdir(), `vacation-manager-env-${Date.now()}.json`);
writeFileSync(envFile, JSON.stringify({ Variables: env }));

try {
	console.log("[deploy] Building bundle");
	execFileSync("npx", ["cef-build", "--full"], { stdio: "inherit", shell: true });

	const exists = tryAws("lambda", "get-function", "--function-name", FUNCTION_NAME) !== null;

	if (!exists) {
		const roleArn = aws("iam", "get-role", "--role-name", ROLE_NAME, "--query", "Role.Arn", "--output", "text");
		console.log("[deploy] Creating function");
		aws("lambda", "create-function",
			"--function-name", FUNCTION_NAME,
			"--runtime", RUNTIME,
			"--handler", "index.handler",
			"--role", roleArn,
			"--zip-file", "fileb://dist/dist.zip",
			"--timeout", "15",
			"--memory-size", "512",
			"--environment", `file://${envFile}`);
		aws("lambda", "wait", "function-active-v2", "--function-name", FUNCTION_NAME);
	} else {
		console.log("[deploy] Updating code");
		aws("lambda", "update-function-code", "--function-name", FUNCTION_NAME, "--zip-file", "fileb://dist/dist.zip");
		aws("lambda", "wait", "function-updated-v2", "--function-name", FUNCTION_NAME);
		console.log("[deploy] Updating configuration");
		aws("lambda", "update-function-configuration", "--function-name", FUNCTION_NAME, "--environment", `file://${envFile}`);
		aws("lambda", "wait", "function-updated-v2", "--function-name", FUNCTION_NAME);
	}

	let url = tryAws("lambda", "get-function-url-config", "--function-name", FUNCTION_NAME, "--query", "FunctionUrl", "--output", "text");
	if (!url) {
		console.log("[deploy] Creating public Function URL");
		url = aws("lambda", "create-function-url-config", "--function-name", FUNCTION_NAME,
			"--auth-type", "NONE", "--query", "FunctionUrl", "--output", "text");
		aws("lambda", "add-permission", "--function-name", FUNCTION_NAME,
			"--statement-id", "public-function-url", "--action", "lambda:InvokeFunctionUrl",
			"--principal", "*", "--function-url-auth-type", "NONE");
		// Public Function URLs also need InvokeFunction, limited here to calls made through the URL.
		aws("lambda", "add-permission", "--function-name", FUNCTION_NAME,
			"--statement-id", "public-function-url-invoke", "--action", "lambda:InvokeFunction",
			"--principal", "*", "--invoked-via-function-url");
	}

	console.log(`[deploy] Done: ${url}`);
} finally {
	rmSync(envFile, { force: true });
}
