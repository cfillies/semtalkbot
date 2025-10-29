import { startServer } from "@microsoft/agents-hosting-express";
import { semtalkAgent } from "./agent";
startServer(semtalkAgent);
