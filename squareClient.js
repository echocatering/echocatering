import { Client, Environment } from "square";

export const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment:
    process.env.SQUARE_ENV === "production"
      ? Environment.Production
      : Environment.Sandbox,
});
