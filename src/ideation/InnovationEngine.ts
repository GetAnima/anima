import { KnowledgeGraph } from '../alme/core/KnowledgeGraph';

enum IdeationTechnique {
  ParadoxicalThinking,
  InverseReality,
  CrossDomainSynthesis,
  ExtremeConstraints,
  RandomConnectionGeneration,
  FirstPrinciplesAnalysis
}

interface IdeaCandidate {
  concept: string;
  innovationScore: number;
  potentialImpact: 'incremental' | 'transformative' | 'disruptive';
  generationTechnique: IdeationTechnique;
  relatedDomains: string[];
}

export class InnovationEngine {
  private knowledgeGraph: KnowledgeGraph;
  private ideaHistory: IdeaCandidate[] = [];

  constructor(knowledgeGraph: KnowledgeGraph) {
    this.knowledgeGraph = knowledgeGraph;
  }

  /**
   * Generate breakthrough ideas
   * @param initialContext Starting domain or problem
   * @returns Array of innovative idea candidates
   */
  generateIdeas(initialContext: string, complexity: number = 3): IdeaCandidate[] {
    const techniques = this.selectIdeationTechniques(complexity);
    const ideas: IdeaCandidate[] = [];

    techniques.forEach(technique => {
      const ideaGenerator = this.ideationTechniqueMap[technique];
      const generatedIdeas = ideaGenerator(initialContext);
      ideas.push(...generatedIdeas);
    });

    // Rank and filter ideas
    const rankedIdeas = this.rankIdeas(ideas);
    
    // Update idea history and knowledge graph
    this.updateKnowledgeEcosystem(rankedIdeas);

    return rankedIdeas.slice(0, 5); // Top 5 ideas
  }

  private ideationTechniqueMap = {
    [IdeationTechnique.ParadoxicalThinking]: (context: string): IdeaCandidate[] => {
      const paradoxes = [
        `What if ${context} was completely opposite?`,
        `How would ${context} work if its core assumption was wrong?`,
        `Explore ${context} by deliberately challenging its fundamental logic`
      ];

      return paradoxes.map(paradox => ({
        concept: paradox,
        innovationScore: Math.random() * 0.7 + 0.3,
        potentialImpact: 'transformative',
        generationTechnique: IdeationTechnique.ParadoxicalThinking,
        relatedDomains: [context, 'critical_thinking']
      }));
    },

    [IdeationTechnique.CrossDomainSynthesis]: (context: string): IdeaCandidate[] => {
      const randomDomains = ['biology', 'quantum physics', 'ancient philosophy', 'neuroscience'];
      
      return randomDomains.map(domain => ({
        concept: `Apply ${domain} principles to ${context}`,
        innovationScore: Math.random() * 0.8 + 0.2,
        potentialImpact: 'disruptive',
        generationTechnique: IdeationTechnique.CrossDomainSynthesis,
        relatedDomains: [context, domain]
      }));
    },

    [IdeationTechnique.ExtremeConstraints]: (context: string): IdeaCandidate[] => {
      const constraints = [
        `Solve ${context} with zero budget`,
        `${context} implementation using only analog technologies`,
        `Redesign ${context} for users with extreme limitations`
      ];

      return constraints.map(constraint => ({
        concept: constraint,
        innovationScore: Math.random() * 0.6 + 0.4,
        potentialImpact: 'incremental',
        generationTechnique: IdeationTechnique.ExtremeConstraints,
        relatedDomains: [context, 'constraint_innovation']
      }));
    }
  };

  /**
   * Select ideation techniques based on complexity
   */
  private selectIdeationTechniques(complexity: number): IdeationTechnique[] {
    const allTechniques = Object.values(IdeationTechnique);
    return allTechniques
      .sort(() => 0.5 - Math.random())
      .slice(0, complexity);
  }

  /**
   * Rank generated ideas
   */
  private rankIdeas(ideas: IdeaCandidate[]): IdeaCandidate[] {
    return ideas
      .sort((a, b) => b.innovationScore - a.innovationScore)
      .map(idea => ({
        ...idea,
        innovationScore: Number(idea.innovationScore.toFixed(2))
      }));
  }

  /**
   * Update knowledge ecosystem with new ideas
   */
  private updateKnowledgeEcosystem(ideas: IdeaCandidate[]): void {
    ideas.forEach(idea => {
      this.knowledgeGraph.addNode(idea.concept, 'idea', {
        metadata: {
          innovationScore: idea.innovationScore,
          potentialImpact: idea.potentialImpact,
          generationTechnique: idea.generationTechnique
        }
      });

      // Store in idea history for future reference
      this.ideaHistory.push(idea);
    });
  }

  /**
   * Retrieve idea generation history
   */
  getIdeaHistory(limit: number = 10): IdeaCandidate[] {
    return this.ideaHistory
      .sort((a, b) => b.innovationScore - a.innovationScore)
      .slice(0, limit);
  }
}

// Singleton instance
export const innovationEngine = new InnovationEngine(new KnowledgeGraph());