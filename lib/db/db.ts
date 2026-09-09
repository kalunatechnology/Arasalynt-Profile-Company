/* ==========================================================================
   DB.TS â€” SQLite Connection, Schema & Auto-Seed
   Menggunakan better-sqlite3 (sinkronus, cocok untuk Next.js Server Components)
   ========================================================================== */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { BUSINESS_DUMMY_DATA, HERO_SLIDES_DUMMY_DATA, TESTIMONIALS_DUMMY_DATA, CASE_STUDIES_DUMMY_DATA, LEADERSHIP_THOUGHTS_DUMMY_DATA } from './dummy';

/* â”€â”€ Resolve database path â”€â”€ */
const DB_DIR = path.join(process.cwd(), '.db');
const SOURCE_DB_PATH = path.join(DB_DIR, 'arsalynt.db');
const IS_VERCEL = Boolean(process.env.VERCEL);
const RUNTIME_DB_PATH = IS_VERCEL
  ? path.join(os.tmpdir(), 'arsalynt.db')
  : SOURCE_DB_PATH;

/*
 * Vercel deployment files are read-only. Copy the committed seed database to
 * the writable /tmp directory once per warm serverless instance. Local
 * development keeps using .db/arsalynt.db so its data remains persistent.
 */
function prepareRuntimeDatabase(): void {
  if (!IS_VERCEL) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    return;
  }

  if (fs.existsSync(RUNTIME_DB_PATH)) return;

  if (fs.existsSync(SOURCE_DB_PATH)) {
    try {
      fs.copyFileSync(
        SOURCE_DB_PATH,
        RUNTIME_DB_PATH,
        fs.constants.COPYFILE_EXCL,
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
    }
  }
}

/* â”€â”€ Inisialisasi koneksi singleton â”€â”€ */
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  prepareRuntimeDatabase();
  _db = new Database(RUNTIME_DB_PATH);

  /* Aktifkan WAL mode untuk performa lebih baik */
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  /* Bootstrap schema & seed */
  initSchema(_db);
  seedIfEmpty(_db);

  return _db;
}

/* â”€â”€ Schema â”€â”€ */
function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id               INTEGER PRIMARY KEY,
      slug             TEXT    NOT NULL UNIQUE,
      name             TEXT    NOT NULL,
      short_name       TEXT,
      category         TEXT    NOT NULL,
      tagline          TEXT    NOT NULL,
      logo             TEXT,
      logo_width       TEXT,
      logo_max_height  TEXT,
      hero_img         TEXT    NOT NULL,
      hero_object_position TEXT,
      hero_overlay_img TEXT,
      about_desc       TEXT    NOT NULL,
      about_img        TEXT    NOT NULL,
      about_object_position TEXT,
      brand_color      TEXT    NOT NULL DEFAULT '#E6FF2A',
      vision_quote     TEXT    NOT NULL,
      vision_text_size TEXT,
      cta_title        TEXT    NOT NULL,
      cta_desc         TEXT    NOT NULL,
      cta_primary_label TEXT,
      cta_primary_href  TEXT,
      cta_secondary_label TEXT,
      cta_secondary_href  TEXT,
      pain_points_title TEXT,
      pain_points_label TEXT,
      services_title   TEXT,
      services_label   TEXT,
      services_columns INTEGER,
      vision_label     TEXT,
      works_label      TEXT,
      works_title      TEXT,
      other_businesses_title TEXT,
      featured_work_index INTEGER DEFAULT 0,
      featured_other_business_index INTEGER DEFAULT 0,
      challenge_bg     TEXT,
      services_bg      TEXT,
      vision_img       TEXT,
      cta_img          TEXT,
      pain_points      TEXT    NOT NULL DEFAULT '[]',  -- JSON array
      services         TEXT    NOT NULL DEFAULT '[]',  -- JSON array
      works            TEXT    NOT NULL DEFAULT '[]',  -- JSON array
      other_businesses TEXT    NOT NULL DEFAULT '[]'   -- JSON array
    );

    CREATE TABLE IF NOT EXISTS hero_slides (
      id                      TEXT    PRIMARY KEY,
      headline                TEXT    NOT NULL,
      body                    TEXT    NOT NULL,
      background_image        TEXT    NOT NULL,
      mobile_background_image TEXT,
      background_position     TEXT    DEFAULT 'center center',
      primary_cta_label       TEXT    NOT NULL,
      primary_cta_href        TEXT    NOT NULL,
      secondary_cta_label     TEXT    NOT NULL,
      secondary_cta_href      TEXT    NOT NULL,
      sort_order              INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id      INTEGER PRIMARY KEY,
      name    TEXT    NOT NULL,
      role    TEXT    NOT NULL,
      text    TEXT    NOT NULL,
      avatar  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      company    TEXT,
      email      TEXT    NOT NULL,
      phone      TEXT,
      inquiry    TEXT,
      message    TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS case_studies (
      id              INTEGER PRIMARY KEY,
      slug            TEXT    NOT NULL UNIQUE,
      title           TEXT    NOT NULL,
      category        TEXT    NOT NULL,
      tags            TEXT    NOT NULL DEFAULT '[]',
      date_label      TEXT    NOT NULL,
      date_value      TEXT    NOT NULL,
      description     TEXT    NOT NULL,
      cover_image     TEXT    NOT NULL,
      cover_image_alt TEXT    NOT NULL,
      sections        TEXT    NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS leadership_thoughts (
      id              INTEGER PRIMARY KEY,
      slug            TEXT    NOT NULL UNIQUE,
      title           TEXT    NOT NULL,
      category        TEXT    NOT NULL,
      tags            TEXT    NOT NULL DEFAULT '[]',
      author          TEXT    NOT NULL,
      read_time       TEXT    NOT NULL,
      date            TEXT    NOT NULL,
      description     TEXT    NOT NULL,
      cover_image     TEXT    NOT NULL,
      cover_image_alt TEXT    NOT NULL,
      sections        TEXT    NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS live_chat_sessions (
      id              TEXT    PRIMARY KEY,
      user_name       TEXT,
      phone           TEXT,
      status          TEXT    NOT NULL DEFAULT 'active',
      last_message    TEXT,
      created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS live_chat_messages (
      id              TEXT    PRIMARY KEY,
      session_id      TEXT    NOT NULL,
      sender          TEXT    NOT NULL, -- 'user', 'bot', 'human_cs'
      content         TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES live_chat_sessions(id) ON DELETE CASCADE
    );
  `);

  /* Ensure columns exist if database was created previously */
  try { db.exec(`ALTER TABLE businesses ADD COLUMN logo TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN logo_width TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN logo_max_height TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN short_name TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN hero_object_position TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN about_object_position TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN vision_text_size TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN services_columns INTEGER;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN works_title TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN pain_points_title TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN pain_points_label TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN services_title TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN services_label TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN vision_label TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN works_label TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN other_businesses_title TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN featured_work_index INTEGER;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN featured_other_business_index INTEGER;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN cta_primary_label TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN cta_primary_href TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN cta_secondary_label TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN cta_secondary_href TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN hero_overlay_img TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN challenge_bg TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN services_bg TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN vision_img TEXT;`); } catch {}
  try { db.exec(`ALTER TABLE businesses ADD COLUMN cta_img TEXT;`); } catch {}
  /* live_chat migration: whatsapp_message_id untuk deduplication */
  try { db.exec(`ALTER TABLE live_chat_messages ADD COLUMN whatsapp_message_id TEXT;`); } catch {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lcm_wa_msg_id ON live_chat_messages(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;`); } catch {}
}

/* â”€â”€ Auto-sync dari dummy.ts ke SQLite database â”€â”€ */
function seedIfEmpty(db: Database.Database): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO businesses
      (id, slug, name, short_name, category, tagline, logo, logo_width, logo_max_height, hero_img, hero_object_position, hero_overlay_img, about_desc, about_img, about_object_position,
       brand_color, vision_quote, vision_text_size, cta_title, cta_desc, cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href,
       pain_points_title, pain_points_label, services_title, services_label, services_columns,
       vision_label, works_label, works_title, other_businesses_title, featured_work_index, featured_other_business_index,
       challenge_bg, services_bg, vision_img, cta_img,
       pain_points, services, works, other_businesses)
    VALUES
      (@id, @slug, @name, @short_name, @category, @tagline, @logo, @logo_width, @logo_max_height, @hero_img, @hero_object_position, @hero_overlay_img, @about_desc, @about_img, @about_object_position,
       @brand_color, @vision_quote, @vision_text_size, @cta_title, @cta_desc, @cta_primary_label, @cta_primary_href, @cta_secondary_label, @cta_secondary_href,
       @pain_points_title, @pain_points_label, @services_title, @services_label, @services_columns,
       @vision_label, @works_label, @works_title, @other_businesses_title, @featured_work_index, @featured_other_business_index,
       @challenge_bg, @services_bg, @vision_img, @cta_img,
       @pain_points, @services, @works, @other_businesses)
  `);

  const insertMany = db.transaction(() => {
    for (const biz of BUSINESS_DUMMY_DATA) {
      insert.run({
        id: biz.id,
        slug: biz.slug,
        name: biz.name,
        short_name: biz.shortName || null,
        category: biz.category,
        tagline: biz.tagline,
        logo: biz.logo || `/images/our-business/${biz.slug}/logo.svg`,
        logo_width: biz.logoWidth ? String(biz.logoWidth) : null,
        logo_max_height: biz.logoMaxHeight ? String(biz.logoMaxHeight) : null,
        hero_img: biz.heroImg,
        hero_object_position: biz.heroObjectPosition || null,
        hero_overlay_img: biz.heroOverlayImg || null,
        about_desc: biz.aboutDesc,
        about_img: biz.aboutImg,
        about_object_position: biz.aboutObjectPosition || null,
        brand_color: biz.brandColor,
        vision_quote: biz.visionQuote,
        vision_text_size: biz.visionTextSize || null,
        cta_title: biz.ctaTitle,
        cta_desc: biz.ctaDesc,
        cta_primary_label: biz.ctaPrimaryLabel || null,
        cta_primary_href: biz.ctaPrimaryHref || null,
        cta_secondary_label: biz.ctaSecondaryLabel || null,
        cta_secondary_href: biz.ctaSecondaryHref || null,
        pain_points_title: biz.painPointsTitle || null,
        pain_points_label: biz.painPointsLabel || null,
        services_title: biz.servicesTitle || null,
        services_label: biz.servicesLabel || null,
        services_columns: biz.servicesColumns ?? null,
        vision_label: biz.visionLabel || null,
        works_label: biz.worksLabel || null,
        works_title: biz.worksTitle || null,
        other_businesses_title: biz.otherBusinessesTitle || null,
        featured_work_index: biz.featuredWorkIndex ?? 0,
        featured_other_business_index: biz.featuredOtherBusinessIndex ?? 0,
        challenge_bg: biz.challengeBg || null,
        services_bg: biz.servicesBg || null,
        vision_img: biz.visionImg || null,
        cta_img: biz.ctaImg || null,
        pain_points: JSON.stringify(biz.painPoints),
        services: JSON.stringify(biz.services),
        works: JSON.stringify(biz.works),
        other_businesses: JSON.stringify(biz.otherBusinesses),
      });
    }
  });

  try {
    insertMany();
    console.log(`[db] Seeded ${BUSINESS_DUMMY_DATA.length} businesses into SQLite.`);
  } catch (err) {
    console.error('Failed to sync DB from dummy:', err);
  }

  const insertHero = db.prepare(`
    INSERT OR REPLACE INTO hero_slides
      (id, headline, body, background_image, mobile_background_image, background_position,
       primary_cta_label, primary_cta_href, secondary_cta_label, secondary_cta_href, sort_order)
    VALUES
      (@id, @headline, @body, @background_image, @mobile_background_image, @background_position,
       @primary_cta_label, @primary_cta_href, @secondary_cta_label, @secondary_cta_href, @sort_order)
  `);

  const insertManyHero = db.transaction(() => {
    HERO_SLIDES_DUMMY_DATA.forEach((slide, idx) => {
      insertHero.run({
        id: String(slide.id),
        headline: slide.headline,
        body: slide.body,
        background_image: slide.backgroundImage,
        mobile_background_image: slide.mobileBackgroundImage || null,
        background_position: slide.backgroundPosition || 'center center',
        primary_cta_label: slide.primaryCta.label,
        primary_cta_href: slide.primaryCta.href,
        secondary_cta_label: slide.secondaryCta.label,
        secondary_cta_href: slide.secondaryCta.href,
        sort_order: idx,
      });
    });
  });

  insertManyHero();

  const testiCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM testimonials').get() as { cnt: number }
  ).cnt;

  if (testiCount < TESTIMONIALS_DUMMY_DATA.length) {
    const insertTesti = db.prepare(`
      INSERT OR REPLACE INTO testimonials (id, name, role, text, avatar)
      VALUES (@id, @name, @role, @text, @avatar)
    `);

    const insertManyTesti = db.transaction(() => {
      TESTIMONIALS_DUMMY_DATA.forEach((item) => {
        insertTesti.run(item);
      });
    });

    insertManyTesti();
    console.log(`[db] Seeded ${TESTIMONIALS_DUMMY_DATA.length} testimonials into SQLite.`);
  }

  const caseStudiesCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM case_studies').get() as { cnt: number }
  ).cnt;

  if (caseStudiesCount < CASE_STUDIES_DUMMY_DATA.length) {
    const insertCase = db.prepare(`
      INSERT OR REPLACE INTO case_studies
        (id, slug, title, category, tags, date_label, date_value, description, cover_image, cover_image_alt, sections)
      VALUES
        (@id, @slug, @title, @category, @tags, @date_label, @date_value, @description, @cover_image, @cover_image_alt, @sections)
    `);

    const insertManyCases = db.transaction(() => {
      CASE_STUDIES_DUMMY_DATA.forEach((item) => {
        insertCase.run({
          id: item.id,
          slug: item.slug,
          title: item.title,
          category: item.category,
          tags: JSON.stringify(item.tags),
          date_label: item.dateLabel,
          date_value: item.dateValue,
          description: item.description,
          cover_image: item.coverImage,
          cover_image_alt: item.coverImageAlt,
          sections: JSON.stringify(item.sections),
        });
      });
    });

    insertManyCases();
    console.log(`[db] Seeded ${CASE_STUDIES_DUMMY_DATA.length} case studies into SQLite.`);
  }

  const thoughtsCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM leadership_thoughts').get() as { cnt: number }
  ).cnt;

  if (thoughtsCount < LEADERSHIP_THOUGHTS_DUMMY_DATA.length) {
    const insertThought = db.prepare(`
      INSERT OR REPLACE INTO leadership_thoughts
        (id, slug, title, category, tags, author, read_time, date, description, cover_image, cover_image_alt, sections)
      VALUES
        (@id, @slug, @title, @category, @tags, @author, @read_time, @date, @description, @cover_image, @cover_image_alt, @sections)
    `);

    const insertManyThoughts = db.transaction(() => {
      LEADERSHIP_THOUGHTS_DUMMY_DATA.forEach((item) => {
        insertThought.run({
          id: item.id,
          slug: item.slug,
          title: item.title,
          category: item.category,
          tags: JSON.stringify(item.tags),
          author: item.author,
          read_time: item.readTime,
          date: item.date,
          description: item.description,
          cover_image: item.coverImage,
          cover_image_alt: item.coverImageAlt,
          sections: JSON.stringify(item.sections),
        });
      });
    });

    insertManyThoughts();
    console.log(`[db] Seeded ${LEADERSHIP_THOUGHTS_DUMMY_DATA.length} leadership thoughts into SQLite.`);
  }
}

export function getAllTestimonials() {
  const db = getDb();
  return db.prepare('SELECT * FROM testimonials ORDER BY id ASC').all();
}

export { getDb };
