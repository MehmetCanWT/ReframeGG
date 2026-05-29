import fs from "fs";
import path from "path";
import LandingClient from "./LandingClient";

export default function Page() {
  let screenshots: string[] = [];

  try {
    const publicDir = path.join(process.cwd(), "public");
    if (fs.existsSync(publicDir)) {
      const files = fs.readdirSync(publicDir);
      
      // Filter for files starting with "app_screenshot"
      screenshots = files
        .filter(f => 
          f.toLowerCase().startsWith("app_screenshot") && 
          (f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".webp"))
        )
        .sort((a, b) => {
          // Sort numerically (e.g. app_screenshot_1.png, app_screenshot_2.png, app_screenshot_10.png)
          const numA = parseInt(a.replace(/[^0-9]/g, "")) || 0;
          const numB = parseInt(b.replace(/[^0-9]/g, "")) || 0;
          return numA - numB;
        });
    }
  } catch (e) {
    console.error("Failed to read public directory for screenshots during build", e);
  }

  // Fallback to default filenames if no matching files are found
  if (screenshots.length === 0) {
    screenshots = ["app_screenshot_1.png", "app_screenshot_2.png"];
  }

  return <LandingClient screenshots={screenshots} />;
}
