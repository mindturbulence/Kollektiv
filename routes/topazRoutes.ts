import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { validate } from "../src/middleware/validate";
import { TopazUpscaleSchema } from "../src/schemas/topaz";

const router = express.Router();

// --- Topaz Gigapixel AI Upscale API ---
const TOPAZ_TMP = path.join(process.cwd(), '.topaz-tmp');
try { if (!fs.existsSync(TOPAZ_TMP)) fs.mkdirSync(TOPAZ_TMP, { recursive: true }); } catch {}
const topazUpload = multer({ dest: TOPAZ_TMP, limits: { fileSize: 100 * 1024 * 1024 } });

// Search for the Gigapixel executable in common install locations + env override
function findTopazExe(): string | null {
  const override = process.env.TOPAZ_GIGAPIXEL_PATH;
  if (override && fs.existsSync(override)) return override;

  const basePaths = [
    'C:\\Program Files\\Topaz Labs LLC\\Topaz Gigapixel AI',
    'C:\\Program Files (x86)\\Topaz Labs LLC\\Topaz Gigapixel AI',
  ];
  const candidates: string[] = [];
  for (const base of basePaths) {
    candidates.push(path.join(base, 'gigapixel.exe'));        // CLI binary
    candidates.push(path.join(base, 'Topaz Gigapixel AI.exe')); // fallback GUI
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const TOPAZ_EXE = findTopazExe();

// GET /api/topaz-status — check if Topaz Gigapixel is available
router.get("/api/topaz-status", (_req, res) => {
  res.json({
    available: !!TOPAZ_EXE,
    path: TOPAZ_EXE || null,
    envOverride: !!process.env.TOPAZ_GIGAPIXEL_PATH,
  });
});

// POST /api/topaz-upscale — upscale an image using locally installed Topaz Gigapixel AI
router.post("/api/topaz-upscale", topazUpload.single('image'), validate(TopazUpscaleSchema), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });

  const ext = path.extname(req.file.originalname) || '.png';
  // Multer saves without extension — rename so Gigapixel can detect the format
  const inputPath = req.file.path + ext;
  try { fs.renameSync(req.file.path, inputPath); } catch {}

  const outputPath = path.join(TOPAZ_TMP, 'out_' + req.file.filename + ext);

  const scale = String(req.body.scale || '4');
  const model = String(req.body.model || 'std');

  // Re-check availability each call (allows installing after server starts)
  const exe = findTopazExe();
  if (!exe) {
    return res.status(503).json({
      error: 'Topaz Gigapixel AI not found. Install from https://www.topazlabs.com/gigapixel-ai',
      hint: 'Set TOPAZ_GIGAPIXEL_PATH environment variable to the executable path if installed in a non-default location.',
    });
  }

  try {
    await new Promise<void>((resolve, reject) => {
      // CLI syntax from `gigapixel.exe --help`:
      //   -i PATH  input file
      //   -o PATH  output file
      //   --scale MULTIPLIER
      //   -m MODEL / --model MODEL
      const child = execFile(exe, [
        '-i', inputPath,
        '-o', outputPath,
        '--scale', scale,
        '-m', model,
      ], { timeout: 300_000 });

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.stdout?.on('data', (_chunk: Buffer) => { /* progress info */ });
      child.on('error', (err) => reject(err));
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Topaz exited with code ${code}. ${stderr.slice(0, 500)}`));
      });
    });

    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({ error: 'Topaz did not produce an output file.' });
    }

    const outputBuf = fs.readFileSync(outputPath);
    res.set('Content-Type', `image/${ext.replace('.', '')}`);
    res.send(outputBuf);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Topaz upscale failed.' });
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

export default router;
