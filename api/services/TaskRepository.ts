import { getDb } from '../db/database.js';
import type { RenderTask, RenderStatus, OutputSettings, TimelineClip, RenderStage } from '../../shared/types.js';

export class TaskRepository {
  create(task: Omit<RenderTask, 'id' | 'createdAt' | 'progress' | 'status'>): RenderTask {
    const db = getDb();
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const status: RenderStatus = 'pending';
    const progress = 0;

    const stmt = db.prepare(`
      INSERT INTO render_tasks (
        id, name, status, progress, timeline, output_settings, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      task.name,
      status,
      progress,
      JSON.stringify(task.timeline),
      JSON.stringify(task.outputSettings),
      createdAt
    );

    return {
      ...task,
      id,
      status,
      progress,
      createdAt,
    };
  }

  findById(id: string): RenderTask | null {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM render_tasks WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;
    return this.rowToTask(row);
  }

  findAll(limit: number = 50): RenderTask[] {
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM render_tasks ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as any[];

    return rows.map(row => this.rowToTask(row));
  }

  updateProgress(id: string, progress: number, stage?: RenderStage): boolean {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE render_tasks SET progress = ?, stage = ? WHERE id = ?
    `);
    const result = stmt.run(progress, stage || null, id);
    return result.changes > 0;
  }

  updateStatus(id: string, status: RenderStatus, errorMessage?: string): boolean {
    const db = getDb();

    let query = 'UPDATE render_tasks SET status = ?';
    const params: any[] = [status];

    if (status === 'processing') {
      query += ', started_at = ?';
      params.push(Date.now());
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      query += ', completed_at = ?';
      params.push(Date.now());
    }

    if (errorMessage) {
      query += ', error_message = ?';
      params.push(errorMessage);
    }

    query += ' WHERE id = ?';
    params.push(id);

    const stmt = db.prepare(query);
    const result = stmt.run(...params);
    return result.changes > 0;
  }

  updateOutputPath(id: string, outputPath: string): boolean {
    const db = getDb();
    const stmt = db.prepare('UPDATE render_tasks SET output_path = ? WHERE id = ?');
    const result = stmt.run(outputPath, id);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM render_tasks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private rowToTask(row: any): RenderTask {
    return {
      id: row.id,
      name: row.name,
      status: row.status as RenderStatus,
      progress: row.progress,
      stage: row.stage as RenderStage | undefined,
      timeline: JSON.parse(row.timeline),
      outputSettings: JSON.parse(row.output_settings),
      outputPath: row.output_path ?? undefined,
      errorMessage: row.error_message ?? undefined,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
    };
  }
}

export default new TaskRepository();
