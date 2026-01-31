let squareClient = null;
let squareModule = null;

const initSquareClient = async () => {
  if (squareClient) return squareClient;
  
  // Dynamic import for ESM module
  if (!squareModule) {
    squareModule = await import("square");
  }
  
  // Square SDK v44+ uses SquareClient and SquareEnvironment
  const { SquareClient, SquareEnvironment } = squareModule;
  squareClient = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment:
      process.env.SQUARE_ENV === "production"
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
  });
  return squareClient;
};

module.exports = { initSquareClient };
