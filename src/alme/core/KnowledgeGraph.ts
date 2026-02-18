type NodeType = 'concept' | 'skill' | 'experience' | 'insight';

interface GraphNode {
  id: string;
  type: NodeType;
  content: string;
  metadata: {
    created: number;
    lastUpdated: number;
    confidence: number;
    sources: string[];
  };
  connections: Array<{
    targetNodeId: string;
    relationship: string;
    strength: number;
  }>;
}

export class KnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private MAX_NODE_CONNECTIONS = 25;

  /**
   * Create or update a knowledge node
   * @param content Core content of the node
   * @param type Type of knowledge node
   * @param metadata Additional metadata
   * @returns Unique node ID
   */
  addNode(
    content: string, 
    type: NodeType = 'concept', 
    metadata: Partial<GraphNode['metadata']> = {}
  ): string {
    const nodeId = this.generateNodeId(content);
    
    const defaultMetadata = {
      created: Date.now(),
      lastUpdated: Date.now(),
      confidence: 0.1,
      sources: []
    };

    const node: GraphNode = {
      id: nodeId,
      type,
      content,
      metadata: { ...defaultMetadata, ...metadata },
      connections: []
    };

    this.nodes.set(nodeId, node);
    return nodeId;
  }

  /**
   * Create a connection between two nodes
   * @param sourceNodeId Origin node
   * @param targetNodeId Destination node
   * @param relationship Type of relationship
   * @param strength Strength of connection
   */
  connect(
    sourceNodeId: string, 
    targetNodeId: string, 
    relationship: string, 
    strength: number = 0.5
  ): void {
    const sourceNode = this.nodes.get(sourceNodeId);
    const targetNode = this.nodes.get(targetNodeId);

    if (!sourceNode || !targetNode) {
      throw new Error('Nodes must exist to create a connection');
    }

    // Prevent excessive connections
    if (sourceNode.connections.length >= this.MAX_NODE_CONNECTIONS) {
      // Remove weakest connection if limit reached
      sourceNode.connections.sort((a, b) => a.strength - b.strength);
      sourceNode.connections.shift();
    }

    sourceNode.connections.push({
      targetNodeId,
      relationship,
      strength
    });

    // Update node confidence and timestamp
    sourceNode.metadata.lastUpdated = Date.now();
    sourceNode.metadata.confidence += 0.01;
  }

  /**
   * Find interconnected nodes
   * @param nodeId Starting node
   * @param maxDepth Maximum connection depth
   * @returns Connected node network
   */
  findRelatedConcepts(
    nodeId: string, 
    maxDepth: number = 3
  ): GraphNode[] {
    const relatedNodes: GraphNode[] = [];
    const visitedNodes = new Set<string>();

    const traverse = (currentNodeId: string, currentDepth: number) => {
      if (currentDepth > maxDepth || visitedNodes.has(currentNodeId)) return;

      const currentNode = this.nodes.get(currentNodeId);
      if (!currentNode) return;

      visitedNodes.add(currentNodeId);
      relatedNodes.push(currentNode);

      // Recursively explore connections
      currentNode.connections.forEach(connection => {
        traverse(connection.targetNodeId, currentDepth + 1);
      });
    };

    traverse(nodeId, 0);
    return relatedNodes;
  }

  /**
   * Generate a unique node ID
   * @param content Node content
   * @returns Unique identifier
   */
  private generateNodeId(content: string): string {
    // Simple hash function to generate unique IDs
    const hash = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash).toString(16);
    };

    return `node_${hash(content)}_${Date.now()}`;
  }

  /**
   * Retrieve entire knowledge graph
   * @returns Comprehensive graph data
   */
  exportGraph(): GraphNode[] {
    return Array.from(this.nodes.values());
  }
}

// Singleton instance for global knowledge tracking
export const knowledgeGraph = new KnowledgeGraph();