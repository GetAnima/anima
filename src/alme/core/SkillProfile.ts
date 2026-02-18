import { SkillCategory, SkillLevel, SkillMetrics } from './types';

/**
 * Represents a comprehensive skill profile for adaptive learning
 */
export class SkillProfile {
  // Core skill categories with their current levels and metrics
  private skills: Map<SkillCategory, {
    level: SkillLevel;
    metrics: SkillMetrics;
    evolutionHistory: Array<{
      timestamp: number;
      previousLevel: SkillLevel;
      changeReason: string;
    }>;
  }> = new Map();

  // Skill categories to track
  private static CORE_CATEGORIES: SkillCategory[] = [
    'communication',
    'technical_reasoning',
    'emotional_intelligence',
    'problem_solving',
    'creative_thinking',
    'system_interaction'
  ];

  constructor() {
    // Initialize skill profile with baseline levels
    SkillProfile.CORE_CATEGORIES.forEach(category => {
      this.skills.set(category, {
        level: 'novice',
        metrics: {
          confidence: 0.1,
          adaptability: 0.1,
          complexity_handled: 0
        },
        evolutionHistory: []
      });
    });
  }

  /**
   * Update skill level and metrics based on performance
   * @param category Skill category to update
   * @param newLevel New skill level
   * @param performanceContext Context of skill improvement
   */
  update(
    category: SkillCategory, 
    newLevel: SkillLevel, 
    performanceContext?: {
      interaction?: string;
      challenges?: string[];
      insights?: string[];
    }
  ): void {
    const currentSkill = this.skills.get(category);
    if (!currentSkill) return;

    // Record skill evolution
    currentSkill.evolutionHistory.push({
      timestamp: Date.now(),
      previousLevel: currentSkill.level,
      changeReason: performanceContext?.interaction || 'Automatic assessment'
    });

    // Update skill level and metrics
    currentSkill.level = newLevel;
    
    // Dynamically adjust metrics based on performance context
    if (performanceContext) {
      currentSkill.metrics.confidence += 0.1;
      currentSkill.metrics.adaptability += performanceContext.challenges ? 0.05 : 0;
      currentSkill.metrics.complexity_handled += performanceContext.challenges?.length || 0;
    }
  }

  /**
   * Get current skill level for a specific category
   * @param category Skill category to check
   * @returns Current skill level
   */
  getLevel(category: SkillCategory): SkillLevel {
    return this.skills.get(category)?.level || 'novice';
  }

  /**
   * Retrieve detailed skill profile
   * @returns Comprehensive skill profile snapshot
   */
  getProfile(): Record<SkillCategory, {
    level: SkillLevel;
    metrics: SkillMetrics;
    evolutionHistory: Array<{
      timestamp: number;
      previousLevel: SkillLevel;
      changeReason: string;
    }>;
  }> {
    return Object.fromEntries(this.skills);
  }

  /**
   * Identify skill categories needing improvement
   * @returns Array of skill categories that need focus
   */
  getImprovementAreas(): SkillCategory[] {
    return Array.from(this.skills.entries())
      .filter(([_, skillData]) => 
        skillData.level === 'novice' || 
        skillData.metrics.confidence < 0.5
      )
      .map(([category]) => category);
  }

  /**
   * Generate a learning focus based on current profile
   * @returns Recommended skill to improve
   */
  recommendLearningFocus(): SkillCategory | null {
    const improvementAreas = this.getImprovementAreas();
    return improvementAreas.length > 0 
      ? improvementAreas[0] 
      : null;
  }
}

// Skill level progression
type SkillLevel = 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert';

// Export for use in other modules
export { SkillLevel };