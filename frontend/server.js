// เซิร์ฟเวอร์เล็ก ๆ ไม่ต้องติดตั้งแพ็กเกจเพิ่ม: เสิร์ฟหน้าเว็บ + ส่งต่อ /api ไปที่ backend (จึงไม่ติด CORS)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5173;
const BACKEND = new URL(process.env.BACKEND || "http://localhost:3000");
const IMAGE_DIRECTORY = path.join(__dirname, "images");
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/style.css": "style.css",
  "/app.js": "app.js",
};
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

http
  .createServer((request, response) => {
    if (request.url.startsWith("/api")) {
      const proxy = http.request(
        {
          host: BACKEND.hostname,
          port: BACKEND.port,
          path: request.url,
          method: request.method,
          headers: { ...request.headers, host: BACKEND.host },
        },
        (backendResponse) => {
          response.writeHead(backendResponse.statusCode, backendResponse.headers);
          backendResponse.pipe(response);
        },
      );

      proxy.on("error", () => {
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            message: `เชื่อมต่อ backend (${BACKEND.origin}) ไม่ได้`,
          }),
        );
      });

      return request.pipe(proxy);
    }

    const requestPath = request.url.split("?")[0];
    if (requestPath.startsWith("/images/")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        return response.end("Method not allowed");
      }

      let imageName;
      try {
        imageName = decodeURIComponent(requestPath.slice("/images/".length));
      } catch {
        response.writeHead(400);
        return response.end("Invalid image path");
      }

      if (
        !imageName ||
        imageName !== path.basename(imageName) ||
        imageName.includes("\\") ||
        imageName.includes("\0")
      ) {
        response.writeHead(404);
        return response.end("Not found");
      }

      const requestedExtension = path.extname(imageName).toLowerCase();
      if (
        requestedExtension &&
        !IMAGE_EXTENSIONS.includes(requestedExtension)
      ) {
        response.writeHead(404);
        return response.end("Not found");
      }

      const extensions = requestedExtension
        ? [""]
        : IMAGE_EXTENSIONS;
      const imagePath = extensions
        .map((extension) => path.join(IMAGE_DIRECTORY, imageName + extension))
        .find(
          (candidate) =>
            path.dirname(candidate) === IMAGE_DIRECTORY &&
            fs.existsSync(candidate) &&
            fs.statSync(candidate).isFile(),
        );
      if (!imagePath) {
        response.writeHead(404);
        return response.end("Not found");
      }

      const extension = path.extname(imagePath);
      response.writeHead(200, {
        "Content-Type":
          extension === ".png" ? "image/png" : "image/jpeg",
      });
      if (request.method === "HEAD") return response.end();

      const image = fs.createReadStream(imagePath);
      image.on("error", () => {
        if (!response.headersSent) response.writeHead(404);
        response.end("Not found");
      });
      return image.pipe(response);
    }

    const fileName = FILES[requestPath];
    if (!fileName) {
      response.writeHead(404);
      return response.end("Not found");
    }

    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(fileName)],
    });
    fs.createReadStream(path.join(__dirname, fileName)).pipe(response);
  })
  .listen(PORT, () => {
    console.log(
      `Frontend: http://localhost:${PORT}  (API → ${BACKEND.origin})`,
    );
  });
