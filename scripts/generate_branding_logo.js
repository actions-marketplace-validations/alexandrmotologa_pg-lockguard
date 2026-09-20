import * as fs from 'node:fs';
import * as path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>

    <!-- Luxury Double-Layer Squircle Shadow -->
    <filter id="squircleShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="28" stdDeviation="36" flood-color="#090d16" flood-opacity="0.09"/>
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#090d16" flood-opacity="0.05"/>
    </filter>

    <!-- Hexagonal Vault Ambient Glow -->
    <linearGradient id="vaultAura" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.02"/>
    </linearGradient>

    <!-- Volumetric Obsidian Lighting Scales -->
    <linearGradient id="titaniumShine" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#64748b"/>
    </linearGradient>

    <linearGradient id="slateLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#64748b"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>

    <linearGradient id="slateMid" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>

    <linearGradient id="slateDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>

    <linearGradient id="obsidianDeep" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#030712"/>
    </linearGradient>

    <!-- Electric Cyan Sentinel Optics -->
    <linearGradient id="cyanCore" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f5ff"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>

    <linearGradient id="cyanHotspot" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="60%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>

    <filter id="eyeGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#00f5ff" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- 1. Luxury Squircle Container -->
  <rect x="32" y="32" width="960" height="960" rx="220" fill="url(#bgGrad)" filter="url(#squircleShadow)" stroke="#e2e8f0" stroke-width="4"/>

  <!-- 2. Concentric Inner Framing Line -->
  <rect x="58" y="58" width="908" height="908" rx="194" fill="none" stroke="#f1f5f9" stroke-width="2"/>

  <!-- 3. Hexagonal Architectural Database Gateway -->
  <polygon points="512,100 815,245 815,625 512,895 209,625 209,245"
           fill="url(#vaultAura)" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="14 10"/>
  <polygon points="512,125 790,260 790,610 512,870 234,610 234,260"
           fill="none" stroke="#0284c7" stroke-width="2" stroke-opacity="0.35"/>

  <!-- 4. Watertight Solid Hound Base Silhouette -->
  <path d="M 512,150 
           L 590,210 L 710,140 L 715,310 L 795,430 L 755,595 L 810,720 L 715,860 L 512,890
           L 309,860 L 214,720 L 269,595 L 229,430 L 309,310 L 314,140 L 434,210 Z"
        fill="#050811"/>

  <!-- 5. Low-Poly Volumetric Facets -->

  <!-- EARS -->
  <!-- Left Ear (Light Side) -->
  <polygon points="434,210 314,140 309,310" fill="url(#slateLight)"/>
  <polygon points="434,210 309,310 410,315" fill="url(#slateMid)"/>
  <polygon points="314,140 309,310 280,260" fill="url(#titaniumShine)"/>
  <polygon points="370,185 314,140 395,250" fill="url(#titaniumShine)"/>
  <!-- Right Ear (Shadow Side) -->
  <polygon points="590,210 710,140 715,310" fill="url(#slateDark)"/>
  <polygon points="590,210 715,310 614,315" fill="url(#obsidianDeep)"/>
  <polygon points="710,140 715,310 744,260" fill="#020617"/>
  <polygon points="654,185 710,140 629,250" fill="url(#slateMid)"/>

  <!-- CRANIAL CREST & FOREHEAD -->
  <polygon points="512,150 434,210 512,250" fill="url(#titaniumShine)"/>
  <polygon points="512,150 590,210 512,250" fill="url(#slateMid)"/>
  <polygon points="434,210 410,315 512,250" fill="url(#slateLight)"/>
  <polygon points="590,210 614,315 512,250" fill="url(#slateDark)"/>

  <!-- TEMPLE & BROW RIDGE -->
  <polygon points="512,250 410,315 450,380 512,340" fill="url(#slateLight)"/>
  <polygon points="512,250 614,315 574,380 512,340" fill="url(#obsidianDeep)"/>

  <!-- WIDE CANINE ZYGOMATIC CHEEKS -->
  <!-- Left Cheek -->
  <polygon points="410,315 309,310 330,420 450,380" fill="url(#slateMid)"/>
  <polygon points="309,310 229,430 330,420" fill="url(#slateDark)"/>
  <polygon points="330,420 229,430 269,595 380,520" fill="url(#slateDark)"/>
  <polygon points="450,380 330,420 380,520" fill="url(#slateMid)"/>
  <!-- Right Cheek -->
  <polygon points="614,315 715,310 694,420 574,380" fill="url(#slateDark)"/>
  <polygon points="715,310 795,430 694,420" fill="url(#obsidianDeep)"/>
  <polygon points="694,420 795,430 755,595 644,520" fill="#030712"/>
  <polygon points="574,380 694,420 644,520" fill="url(#obsidianDeep)"/>

  <!-- NASAL BRIDGE & CENTRAL SNOUT -->
  <polygon points="512,340 450,380 470,480 512,470" fill="url(#titaniumShine)"/>
  <polygon points="512,340 574,380 554,480 512,470" fill="url(#slateDark)"/>
  <polygon points="512,470 470,480 460,580 512,580" fill="url(#slateLight)"/>
  <polygon points="512,470 554,480 564,580 512,580" fill="url(#obsidianDeep)"/>

  <!-- PROMINENT PREDATOR OPTICS (High-Impact Slanted Almond Eyes) -->
  <!-- Left Eye -->
  <polygon points="450,380 512,340 470,420" fill="#030712"/>
  <polygon points="420,382 485,398 450,420" fill="#090d16"/>
  <polygon points="432,388 478,400 452,416" fill="url(#cyanCore)" filter="url(#eyeGlow)"/>
  <polygon points="440,392 470,400 454,412" fill="url(#cyanHotspot)"/>
  <circle cx="456" cy="402" r="3" fill="#ffffff"/>
  <!-- Right Eye -->
  <polygon points="574,380 512,340 554,420" fill="#010409"/>
  <polygon points="604,382 539,398 574,420" fill="#030712"/>
  <polygon points="592,388 546,400 572,416" fill="url(#cyanCore)" filter="url(#eyeGlow)"/>
  <polygon points="584,392 554,400 570,412" fill="url(#cyanHotspot)"/>
  <circle cx="568" cy="402" r="3" fill="#ffffff"/>

  <!-- MUZZLE FLANKS & WHISKER PADS (Robust, Low-Poly Slate) -->
  <!-- Left Whisker -->
  <polygon points="450,380 470,480 380,520" fill="url(#slateLight)"/>
  <polygon points="470,480 460,580 395,615 380,520" fill="url(#slateMid)"/>
  <!-- Right Whisker -->
  <polygon points="574,380 554,480 644,520" fill="url(#slateDark)"/>
  <polygon points="554,480 564,580 629,615 644,520" fill="url(#obsidianDeep)"/>

  <!-- NOSE & UPPER JAW (Hexagonal Geometry) -->
  <polygon points="512,550 480,580 512,610 544,580" fill="#030712"/>
  <polygon points="512,610 480,580 465,650 512,665" fill="url(#slateMid)"/>
  <polygon points="512,610 544,580 559,650 512,665" fill="url(#slateDark)"/>

  <!-- LOWER JAW & CHIN PLATES -->
  <polygon points="465,650 395,615 435,700 512,715" fill="url(#slateDark)"/>
  <polygon points="559,650 629,615 589,700 512,715" fill="url(#obsidianDeep)"/>
  <polygon points="512,665 465,650 512,715" fill="url(#slateLight)"/>
  <polygon points="512,665 559,650 512,715" fill="url(#slateDark)"/>

  <!-- MASSIVE ARMORED SENTINEL SHOULDERS & COLLAR -->
  <!-- Left Shoulder -->
  <polygon points="380,520 269,595 214,720 350,710" fill="url(#obsidianDeep)"/>
  <polygon points="380,520 395,615 350,710" fill="url(#slateDark)"/>
  <polygon points="350,710 214,720 309,860 420,800" fill="url(#obsidianDeep)"/>
  <polygon points="435,700 350,710 420,800 512,770" fill="url(#slateDark)"/>
  <!-- Right Shoulder -->
  <polygon points="644,520 755,595 810,720 674,710" fill="#020617"/>
  <polygon points="644,520 629,615 674,710" fill="url(#obsidianDeep)"/>
  <polygon points="674,710 810,720 715,860 604,800" fill="#020617"/>
  <polygon points="589,700 674,710 604,800 512,770" fill="url(#obsidianDeep)"/>

  <!-- CENTRAL DATABASE VAULT LOCK CHEST SHIELD -->
  <polygon points="512,715 420,800 512,890 604,800" fill="url(#slateMid)"/>
  <polygon points="512,715 420,800 512,770" fill="url(#slateLight)"/>
  <polygon points="512,715 604,800 512,770" fill="url(#slateDark)"/>

  <!-- Electric Cyan Database Lock Emblems -->
  <!-- Vault Padlock Shackle Accent -->
  <path d="M 488,775 C 488,760 536,760 536,775" fill="none" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
  <!-- Vault Core Gem -->
  <polygon points="512,780 475,815 512,850 549,815" fill="url(#cyanCore)" filter="url(#eyeGlow)"/>
  <polygon points="512,790 487,815 512,840 537,815" fill="url(#cyanHotspot)"/>
  <!-- Keyhole Negative Space Detail -->
  <circle cx="512" cy="812" r="4" fill="#050811"/>
  <polygon points="510,812 514,812 516,825 508,825" fill="#050811"/>
</svg>`;

const resvg = new Resvg(svgContent, {
  fitTo: {
    mode: 'width',
    value: 1024,
  },
});

const pngData = resvg.render();
const pngBuffer = pngData.asPng();

fs.writeFileSync(path.join(process.cwd(), 'assets', 'logo.svg'), svgContent, 'utf-8');
fs.writeFileSync(path.join(process.cwd(), 'assets', 'logo.png'), pngBuffer);

console.log('Successfully generated refined assets/logo.svg and rendered assets/logo.png (1024x1024)');
