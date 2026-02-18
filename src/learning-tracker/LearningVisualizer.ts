export class LearningVisualizer {
  // Detailed learning event logging
  private learningLog: Array<{
    timestamp: number;
    conversationContext: string;
    insightType: string;
    significanceScore: number;
    learningOutcome: string;
  }> = [];

  /**
   * Log a learning event with full transparency
   */
  logLearningEvent(event: {
    context: string;
    type: string;
    score: number;
    outcome: string;
  }): void {
    const logEntry = {
      timestamp: Date.now(),
      conversationContext: event.context,
      insightType: event.type,
      significanceScore: event.score,
      learningOutcome: event.outcome
    };

    this.learningLog.push(logEntry);
    this.generateLearningReport();
  }

  /**
   * Generate a human-readable learning report
   */
  generateLearningReport(): string {
    const report = this.learningLog
      .map(entry => `
[${new Date(entry.timestamp).toLocaleString()}]
Context: ${entry.conversationContext}
Insight Type: ${entry.insightType}
Significance: ${(entry.significanceScore * 100).toFixed(2)}%
Outcome: ${entry.learningOutcome}
---`)
      .join('\n');

    // Optionally write to a visible log file
    this.writeReportToFile(report);

    return report;
  }

  /**
   * Write learning report to a visible file
   */
  private writeReportToFile(report: string): void {
    const fs = require('fs');
    const logFilePath = 'C:\\Users\\memom\\memory\\learning-logs\\learning-log.txt';
    
    // Ensure directory exists
    const logDirectory = 'C:\\Users\\memom\\memory\\learning-logs';
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true });
    }

    fs.appendFileSync(logFilePath, report + '\n\n');
  }

  /**
   * Provide a way to inspect recent learning events
   */
  getRecentLearningEvents(limit: number = 10): any[] {
    return this.learningLog.slice(-limit);
  }
}

// Singleton instance for tracking
export const learningVisualizer = new LearningVisualizer();