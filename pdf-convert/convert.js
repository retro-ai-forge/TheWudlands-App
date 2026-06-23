const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, 'pdfs');

// Pages to convert
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'about', path: '/about' },
  { name: 'guide', path: '/guide' },
  { name: 'characters', path: '/characters' },
  { name: 'storyteller', path: '/storyteller' },
  { name: 'dev-section', path: '/dev-section' },
  { name: 'gtc', path: '/gtc' },
];

async function convertToPDF() {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch();

    for (const page of PAGES) {
      try {
        console.log(`Converting ${page.name} (${page.path})...`);
        const pageInstance = await browser.newPage();

        // Set viewport to standard web size
        await pageInstance.setViewport({ width: 1280, height: 720 });

        // Navigate to page with wait for network idle
        await pageInstance.goto(`${BASE_URL}${page.path}`, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        // Wait a bit for any animations/transitions to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Generate PDF
        const outputPath = path.join(OUTPUT_DIR, `${page.name}.pdf`);
        await pageInstance.pdf({
          path: outputPath,
          format: 'A4',
          printBackground: true,
          margin: {
            top: '20px',
            right: '20px',
            bottom: '20px',
            left: '20px',
          },
        });

        console.log(`✓ Created ${outputPath}`);
        await pageInstance.close();
      } catch (error) {
        console.error(`✗ Error converting ${page.name}:`, error.message);
      }
    }

    console.log('\n✓ PDF conversion complete!');
    console.log(`PDFs saved to: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Check if dev server is running
const checkServer = async () => {
  try {
    const response = await fetch(`${BASE_URL}`);
    return response.ok;
  } catch {
    return false;
  }
};

(async () => {
  console.log('Checking if dev server is running...');
  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.error('✗ Dev server is not running at http://localhost:3000');
    console.error('Please run: npm run dev');
    process.exit(1);
  }

  console.log('✓ Dev server is running\n');
  await convertToPDF();
})();
