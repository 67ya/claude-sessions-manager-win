import { Router, Request, Response } from "express";
import multer from "multer";
import { getNode } from "../services/nodes";
import { listFiles, getFileContent, writeFile, deleteFileOrDir } from "../services/ssh";

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

function getNodeOrFail(res: Response, nodeId: string) {
  const node = getNode(nodeId);
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return null;
  }
  return node;
}

// List directory
router.get("/", async (req: Request, res: Response) => {
  const node = getNodeOrFail(res, req.params.nodeId);
  if (!node) return;
  try {
    const result = await listFiles(node, (req.query.path as string) || "/");
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to list files" });
  }
});

// Get file content (download)
router.get("/download", async (req: Request, res: Response) => {
  const node = getNodeOrFail(res, req.params.nodeId);
  if (!node) return;
  const path = req.query.path as string;
  if (!path) {
    res.status(400).json({ error: "path required" });
    return;
  }
  try {
    const { data, filename } = await getFileContent(node, path);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to read file" });
  }
});

// Upload file(s)
router.post("/upload", upload.array("files", 10), async (req: Request, res: Response) => {
  const node = getNodeOrFail(res, req.params.nodeId);
  if (!node) return;
  const remoteDir = (req.body.path as string) || "/tmp";
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }
  try {
    const results: { name: string; success: boolean; error?: string }[] = [];
    for (const file of files) {
      try {
        const targetPath = remoteDir.endsWith("/")
          ? `${remoteDir}${file.originalname}`
          : `${remoteDir}/${file.originalname}`;
        await writeFile(node, targetPath, file.buffer);
        results.push({ name: file.originalname, success: true });
      } catch (e: any) {
        results.push({ name: file.originalname, success: false, error: e.message });
      }
    }
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Upload failed" });
  }
});

// Delete file or directory
router.delete("/", async (req: Request, res: Response) => {
  const node = getNodeOrFail(res, req.params.nodeId);
  if (!node) return;
  const path = req.query.path as string;
  if (!path) {
    res.status(400).json({ error: "path required" });
    return;
  }
  try {
    await deleteFileOrDir(node, path);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to delete" });
  }
});

export default router;
