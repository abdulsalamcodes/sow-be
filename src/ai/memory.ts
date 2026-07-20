import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';

export interface DatabaseConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const LAST_MESSAGES = 20;
const STORE_ID = 'sow-memory';

export const buildMemory = (connection: DatabaseConnection): Memory =>
  new Memory({
    storage: new PostgresStore({ id: STORE_ID, ...connection }),
    options: { lastMessages: LAST_MESSAGES },
  });
