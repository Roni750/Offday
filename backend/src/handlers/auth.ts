import bcrypt from "bcryptjs";
import { CommonEvent } from "commoneventframework/dist/types/commonEvent";
import { DateTime } from "luxon";
import { z } from "zod";
import { loadActor } from "../auth/loadActor";
import { signToken } from "../auth/tokens";
import { UnauthenticatedError } from "../core/errors";
import { getDataSource } from "../db/dataSource";
import { User } from "../domain/User";
import { authenticate, getQuery, parseJsonBody, validate } from "../http/parse";
import { Authenticated, withActor } from "../http/withActor";
import { getBalance } from "../queries/vacationQueries";
import { toMe } from "../queries/serializers";
import { HandlerFn, InputParserFn } from "./types";

const loginSchema = z.object({
	email: z.string().trim().toLowerCase().email().max(254),
	password: z.string().min(1).max(200),
});

export const parseLogin: InputParserFn = (event: CommonEvent) => validate(loginSchema, parseJsonBody(event));

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const login: HandlerFn = async ({ email, password }: z.infer<typeof loginSchema>) => {
	const { manager } = await getDataSource();
	const user = await manager.createQueryBuilder(User, "u").addSelect("u.password").where("u.email = :email", { email }).getOne();

	const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
	if (!user || !valid) throw new UnauthenticatedError("That email and password don't match an account");

	const actor = await loadActor(manager, user.id);
	return { token: signToken(user.id), user: toMe(actor) };
};

export const parseAuthenticated: InputParserFn = (event: CommonEvent): Authenticated => ({ userId: authenticate(event) });

export const getMe = withActor(async (_input, actor) => toMe(actor));

const yearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

export const parseBalance: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	...validate(yearQuery, getQuery(event)),
});

export const getMyBalance = withActor<Authenticated & { year?: number }>(async ({ year }, actor, em) =>
	getBalance(em, actor, year ?? DateTime.now().setZone(actor.timezone).year));
