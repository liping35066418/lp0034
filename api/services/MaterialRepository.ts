import { getDb } from '../db/database.js';
import type { Material, MaterialType, MaterialStatus, AIAnalysisResult } from '../../shared/types.js';
import { nanoid } from 'nanoid';

export class MaterialRepository {
  create(material: Omit<Material, 'id' | 'createdAt'>): Material {
    const db = getDb();
    const id = nanoid();
    const createdAt = Date.now();

    const stmt = db.prepare(`
      INSERT INTO materials (
        id, name, type, size, duration, width, height, fps, format,
        file_path, thumbnail_path, status, ai_analysis, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      material.name,
      material.type,
      material.size,
      material.duration || null,
      material.width || null,
      material.height || null,
      material.fps || null,
      material.format,
      material.filePath,
      material.thumbnailPath || null,
      material.status,
      material.aiAnalysis ? JSON.stringify(material.aiAnalysis) : null,
      createdAt
    );

    return { ...material, id, createdAt };
  }

  findById(id: string): Material | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM materials WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;
    return this.rowToMaterial(row);
  }

  findAll(type?: MaterialType): Material[] {
    const db = getDb();
    let query = 'SELECT * FROM materials';
    const params: any[] = [];

    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToMaterial(row));
  }

  update(id: string, updates: Partial<Material>): boolean {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.duration !== undefined) {
      fields.push('duration = ?');
      values.push(updates.duration);
    }
    if (updates.width !== undefined) {
      fields.push('width = ?');
      values.push(updates.width);
    }
    if (updates.height !== undefined) {
      fields.push('height = ?');
      values.push(updates.height);
    }
    if (updates.fps !== undefined) {
      fields.push('fps = ?');
      values.push(updates.fps);
    }
    if (updates.thumbnailPath !== undefined) {
      fields.push('thumbnail_path = ?');
      values.push(updates.thumbnailPath);
    }
    if (updates.aiAnalysis !== undefined) {
      fields.push('ai_analysis = ?');
      values.push(JSON.stringify(updates.aiAnalysis));
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = db.prepare(`UPDATE materials SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    return result.changes > 0;
  }

  delete(id: string): boolean {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM materials WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  updateAiAnalysis(id: string, analysis: AIAnalysisResult): boolean {
    return this.update(id, { aiAnalysis: analysis });
  }

  updateStatus(id: string, status: MaterialStatus): boolean {
    return this.update(id, { status });
  }

  private rowToMaterial(row: any): Material {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      size: row.size,
      duration: row.duration ?? undefined,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      fps: row.fps ?? undefined,
      format: row.format,
      filePath: row.file_path,
      thumbnailPath: row.thumbnail_path ?? undefined,
      status: row.status,
      createdAt: row.created_at,
      aiAnalysis: row.ai_analysis ? JSON.parse(row.ai_analysis) : undefined,
    };
  }
}

export default new MaterialRepository();
