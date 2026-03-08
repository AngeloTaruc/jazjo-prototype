import handleRequest from "../server/index.mjs";

export default async function handler(req, res){
  return handleRequest(req, res);
}
