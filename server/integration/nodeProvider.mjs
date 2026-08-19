import { createNodeInfrastructure } from '../nodeInfrastructure.mjs';

const infrastructure = await createNodeInfrastructure(process.env);
export const postgres = infrastructure.postgres;
export const redis = infrastructure.redis;
export const close = () => infrastructure.close();
