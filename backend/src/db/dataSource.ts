import "reflect-metadata";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./dataSourceOptions";

let dataSource: DataSource | undefined;

// Built lazily and reused across warm Lambda invocations.
export const getDataSource = async (): Promise<DataSource> => {
	if (!dataSource) dataSource = new DataSource(buildDataSourceOptions());
	if (!dataSource.isInitialized) await dataSource.initialize();
	return dataSource;
};
