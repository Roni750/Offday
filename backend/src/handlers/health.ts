import { HandlerFn } from "./types";
import { getDataSource } from "../db/dataSource";

export const getHealth: HandlerFn = async () => {
	const ds = await getDataSource();
	await ds.query("SELECT 1");
	return { status: "ok", db: "up" };
};
