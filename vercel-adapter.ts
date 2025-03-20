import { Request, Response } from "express";
import app from "./server/index";

export default async (req: Request, res: Response) => {
  await app(req, res);
};