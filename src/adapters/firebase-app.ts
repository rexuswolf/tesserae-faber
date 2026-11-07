// The Firebase project, set up once for the adapters that need it.
import { initializeApp } from "firebase/app";
import config from "../firebase-config.json";

export const app = initializeApp(config);
