import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobile = "0066" + "0656866237".slice(1);
const tlv = (id, value) => id + String(value.length).padStart(2, "0") + value;
const promptPayAccount = tlv("00", "A000000677010111") + tlv("01", mobile);
const body = tlv("00", "01")
  + tlv("01", "11")
  + tlv("29", promptPayAccount)
  + tlv("53", "764")
  + tlv("58", "TH")
  + "6304";

function crc16ccitt(text) {
  let crc = 0xffff;
  for (const character of text) {
    crc ^= character.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const payload = body + crc16ccitt(body);
const svg = await QRCode.toString(payload, {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 4,
  width: 480,
  color: { dark: "#13291d", light: "#ffffff" },
});
const output = resolve(root, "assets/promptpay-qr.svg");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, svg, "utf8");
console.log(`Created ${output}`);
console.log(`PromptPay payload: ${payload}`);
