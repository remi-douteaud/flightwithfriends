// QR rendering (qrcode-generator) and camera scanning (jsQR). Both libs are globals from vendor/.

const QUIET_ZONE = 4;

export function renderQr(canvas, text) {
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount() + 2 * QUIET_ZONE;
  const cell = Math.floor(canvas.width / n);
  const offset = Math.floor((canvas.width - cell * n) / 2) + QUIET_ZONE * cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < qr.getModuleCount(); r++) {
    for (let c = 0; c < qr.getModuleCount(); c++) {
      if (qr.isDark(r, c)) ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
    }
  }
}

export class QrScanner {
  constructor(video) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.stream = null;
    this.timer = null;
  }

  async start(onResult) {
    this.active = true;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (!this.active) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    this.timer = setInterval(() => {
      const text = this.decodeFrame();
      if (text) { this.stop(); onResult(text); }
    }, 150);
  }

  decodeFrame() {
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return null;
    const scale = Math.min(1, 640 / v.videoWidth);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const result = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    return result ? result.data : null;
  }

  stop() {
    this.active = false;
    clearInterval(this.timer);
    this.timer = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
