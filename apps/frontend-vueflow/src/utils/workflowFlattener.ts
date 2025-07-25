import type { Node as VueFlowNode, Edge } from "@vue-flow/core";
import { getNodeType } from "@/utils/nodeUtils";
import { klona } from "klona/full"; // ++ 导入 klona
import type { useWorkflowData } from '@/composables/workflow/useWorkflowData';
import type { useProjectStore } from '@/stores/projectStore';
import type { useWorkflowManager } from '@/composables/workflow/useWorkflowManager';

/**
 * 递归地扁平化工作流，展开所有 NodeGroup。
 * @param internalId 标签页 ID (用于加载子工作流)。
 * @param initialElements 初始的顶层元素。
 * @param workflowDataHandler useWorkflowData 的实例。
 * @param projectStore useProjectStore 的实例。
 * @param workflowManager useWorkflowManager 的实例 (用于转换和获取节点类型)。
 * @param processedGroupIds 用于检测循环引用的 Set。
 * @returns 包含扁平化节点和边的对象，或在错误时返回 null。
 */
export async function flattenWorkflow(
  internalId: string,
  initialElements: (VueFlowNode | Edge)[],
  workflowDataHandler: ReturnType<typeof useWorkflowData>,
  projectStore: ReturnType<typeof useProjectStore>,
  workflowManager: ReturnType<typeof useWorkflowManager>, // 添加 workflowManager 依赖
  processedGroupIds: Set<string> = new Set()
): Promise<{ nodes: VueFlowNode[], edges: Edge[] } | null> {
  console.debug(`[Flatten START] internalId: ${internalId}, processing ${initialElements.length} elements. Initial node IDs: ${initialElements.filter(el => !('source' in el)).map(n => n.id + '(' + getNodeType(n as VueFlowNode) + ')').join(', ')}. ProcessedGroupIds: ${Array.from(processedGroupIds).join(', ')}`);
  const flattenedNodes: VueFlowNode[] = [];
  const flattenedEdges: Edge[] = [];
  const nodeMap = new Map<string, VueFlowNode>(); // 存储所有遇到的节点（包括内部的）
  const edgeQueue: Edge[] = []; // 待处理的边

  const elementsToProcess = [...initialElements]; // 复制以避免修改原始数组

  // 初始处理顶层节点和边
  for (const el of elementsToProcess) {
    if (!('source' in el)) { // 是节点
      nodeMap.set(el.id, el);
    } else { // 是边
      edgeQueue.push(el);
    }
  }

  const nodesToExpand = [...nodeMap.values()]; // 获取初始节点列表

  while (nodesToExpand.length > 0) {
    const node = nodesToExpand.shift();
    if (!node) continue;

    const nodeType = getNodeType(node); // 使用导入的辅助函数

    if (nodeType === 'core:NodeGroup') { // 假设 NodeGroup 类型以 :NodeGroup 结尾
      const referencedWorkflowId = node.data?.configValues?.referencedWorkflowId as string | undefined; // Corrected path
      console.debug(`[Flatten NodeGroup] Expanding NodeGroup ${node.id} (type: ${nodeType}), referencedWorkflowId: ${referencedWorkflowId}`);
      if (!referencedWorkflowId) {
        console.warn(`[Flatten] NodeGroup ${node.id} is missing referencedWorkflowId. Skipping expansion.`);
        // 将其视为普通节点（虽然可能不正确，但避免执行中断）
        flattenedNodes.push(node);
        continue;
      }

      // 检测循环引用
      if (processedGroupIds.has(referencedWorkflowId)) {
        console.error(`[Flatten] Circular reference detected: Group ${referencedWorkflowId} is already being processed. Aborting expansion for this instance.`);
        // 可以选择抛出错误或跳过
        continue; // 跳过此实例的展开
      }

      // 加载引用的工作流
      const projectId = projectStore.currentProjectId; // 获取当前项目 ID
      if (!projectId) {
        console.error(`[Flatten] Cannot load referenced workflow ${referencedWorkflowId}: Project ID is missing.`);
        return null; // 无法继续
      }

      console.debug(`[Flatten] Expanding NodeGroup ${node.id}, loading workflow ${referencedWorkflowId} from project ${projectId}`);
      // 修正 loadWorkflow 参数顺序
      const { success, loadedData } = await workflowDataHandler.loadWorkflow(internalId, projectId, referencedWorkflowId);

      if (!success || !loadedData) {
        console.error(`[Flatten] Failed to load referenced workflow ${referencedWorkflowId} for NodeGroup ${node.id}.`);
        return null; // 加载失败，无法继续
      }

      // 标记此组正在处理
      processedGroupIds.add(referencedWorkflowId);

      // 准备子工作流元素 (需要转换)
      const subWorkflowElements: (VueFlowNode | Edge)[] = [];
      if (loadedData.nodes) {
        for (const storageNode of loadedData.nodes) {
          // 使用 workflowManager 实例进行转换
          const vueNode = workflowManager.storageNodeToVueFlowNode(storageNode);
          subWorkflowElements.push(vueNode);
        }
      }
      if (loadedData.edges) {
        for (const storageEdge of loadedData.edges) {
          // 使用 workflowManager 实例进行转换
          const vueEdge = workflowManager.storageEdgeToVueFlowEdge(storageEdge);
          subWorkflowElements.push(vueEdge);
        }
      }


      // 递归处理子工作流
      // 注意：这里调用自身 flattenWorkflow
      console.debug(`[Flatten NodeGroup ${node.id}] Recursively calling flattenWorkflow for sub-workflow ${referencedWorkflowId} with ${subWorkflowElements.length} elements. Sub-workflow node IDs: ${subWorkflowElements.filter(el => !('source' in el)).map(n => n.id + '(' + getNodeType(n as VueFlowNode) + ')').join(', ')}`);
      const flattenedSubWorkflow = await flattenWorkflow(
        internalId,
        subWorkflowElements,
        workflowDataHandler,
        projectStore,
        workflowManager, // 传递 workflowManager
        new Set(processedGroupIds) // 传递副本以隔离递归分支
      );

      if (!flattenedSubWorkflow) {
        console.error(`[Flatten] Failed to flatten sub-workflow ${referencedWorkflowId} for NodeGroup ${node.id}.`);
        processedGroupIds.delete(referencedWorkflowId); // 回溯时移除标记
        return null; // 递归失败
      }
      console.debug(`[Flatten NodeGroup ${node.id}] Returned from recursive call for ${referencedWorkflowId}. Flattened sub-workflow has ${flattenedSubWorkflow.nodes.length} nodes and ${flattenedSubWorkflow.edges.length} edges.`);
      console.debug(`[Flatten NodeGroup ${node.id}] Sub-workflow nodes: ${flattenedSubWorkflow.nodes.map(n => `${n.id}(${getNodeType(n)})`).join(', ')}`);
      // console.debug(`[Flatten NodeGroup ${node.id}] Sub-workflow edges: ${flattenedSubWorkflow.edges.map(e => `${e.id} (${e.sourceHandle} -> ${e.targetHandle})`).join(', ')}`);
 
 
      // --- 处理 NodeGroup 实例的 inputValues 覆盖 ---
      const parentNodeGroupInstance = node; // 当前正在展开的 NodeGroup
      if (parentNodeGroupInstance.data?.inputValues && Object.keys(parentNodeGroupInstance.data.inputValues).length > 0) {
        const instanceInputValues = parentNodeGroupInstance.data.inputValues;
        const subWorkflowNodes = flattenedSubWorkflow.nodes;
        let subWorkflowEdges = flattenedSubWorkflow.edges; // 可变

        for (const subNode of subWorkflowNodes) {
          if (getNodeType(subNode) === 'core:GroupInput') {
            const internalGroupInputNode = subNode;
            const outputSlotKeys = Object.keys(internalGroupInputNode.data?.outputs || {});

            for (const slotKeyInParent of outputSlotKeys) {
              if (instanceInputValues.hasOwnProperty(slotKeyInParent)) {
                const overrideValue = instanceInputValues[slotKeyInParent];
                console.debug(`[Flatten NodeGroup ${parentNodeGroupInstance.id}] Applying override for '${slotKeyInParent}' with value:`, klona(overrideValue));

                const edgesToProcessForOverride: Edge[] = [];
                const remainingEdgesAfterOverride: Edge[] = [];

                for (const edge of subWorkflowEdges) {
                  if (edge.source === internalGroupInputNode.id && edge.sourceHandle === slotKeyInParent) {
                    edgesToProcessForOverride.push(edge);
                  } else {
                    remainingEdgesAfterOverride.push(edge);
                  }
                }
                
                if (edgesToProcessForOverride.length > 0) {
                    subWorkflowEdges = remainingEdgesAfterOverride;

                    for (const edgeBeingReplaced of edgesToProcessForOverride) {
                        const targetNodeForOverride = subWorkflowNodes.find(n => n.id === edgeBeingReplaced.target);
                        if (targetNodeForOverride && edgeBeingReplaced.targetHandle) {
                            targetNodeForOverride.data = targetNodeForOverride.data || {};
                            targetNodeForOverride.data.inputValues = targetNodeForOverride.data.inputValues || {};
                            targetNodeForOverride.data.inputValues[edgeBeingReplaced.targetHandle] = klona(overrideValue);
                            
                            console.debug(`[Flatten NodeGroup ${parentNodeGroupInstance.id}] Set input '${edgeBeingReplaced.targetHandle}' of node '${targetNodeForOverride.id}' to override value. Edge ${edgeBeingReplaced.id} removed.`);
                        } else {
                            console.warn(`[Flatten NodeGroup ${parentNodeGroupInstance.id}] Could not find target node '${edgeBeingReplaced.target}' for override via edge ${edgeBeingReplaced.id}`);
                        }
                    }
                } else {
                    console.debug(`[Flatten NodeGroup ${parentNodeGroupInstance.id}] Override value for '${slotKeyInParent}' exists, but GroupInput's output slot is not connected internally.`);
                }
              }
            }
          }
        }
        flattenedSubWorkflow.edges = subWorkflowEdges;
      }
      // --- inputValues 处理结束 ---

      // --- 核心：I/O 映射 ---
      const internalNodesMap = new Map(flattenedSubWorkflow.nodes.map(n => [n.id, n])); // 子流扁平化后的节点
      // 找到内部的 GroupInput 和 GroupOutput 节点 (假设类型固定)
      // 注意：需要使用 getNodeType 辅助函数
      const internalGroupInput = flattenedSubWorkflow.nodes.find(n => getNodeType(n) === 'core:GroupInput'); // 使用带命名空间的类型
      const internalGroupOutput = flattenedSubWorkflow.nodes.find(n => getNodeType(n) === 'core:GroupOutput'); // 使用带命名空间的类型

      if (internalGroupInput) {
        console.debug(`[Flatten NodeGroup ${node.id}] Found internalGroupInput: ${internalGroupInput.id} for sub-workflow ${referencedWorkflowId}`);
      } else {
        console.warn(`[Flatten NodeGroup ${node.id}] Did NOT find internalGroupInput for sub-workflow ${referencedWorkflowId}. This might be an issue if it's not a deeply nested group or if the sub-workflow is empty.`);
      }
      if (internalGroupOutput) {
        console.debug(`[Flatten NodeGroup ${node.id}] Found internalGroupOutput: ${internalGroupOutput.id} for sub-workflow ${referencedWorkflowId}`);
      } else {
        console.warn(`[Flatten NodeGroup ${node.id}] Did NOT find internalGroupOutput for sub-workflow ${referencedWorkflowId}. This might be an issue if it's not a deeply nested group or if the sub-workflow is empty.`);
      }

      // 映射连接到 NodeGroup 输入的边
      const incomingEdges = edgeQueue.filter(edge => edge.target === node.id);
      for (const incomingEdge of incomingEdges) {
        const targetHandle = incomingEdge.targetHandle; // NodeGroup 上的输入句柄 (对应 interfaceInputs key)
        if (!targetHandle || !internalGroupInput) continue;

        // 找到内部 GroupInput 对应输出句柄出发的边
        const internalEdge = flattenedSubWorkflow.edges.find(
          subEdge => subEdge.source === internalGroupInput.id && subEdge.sourceHandle === targetHandle
        );
        if (internalEdge) {
          // 获取内部目标节点
          const internalTargetNode = internalNodesMap.get(internalEdge.target);
          if (!internalTargetNode) {
            console.warn(`[Flatten] Internal target node ${internalEdge.target} not found for edge ${internalEdge.id}`);
            continue;
          }
          // 创建新的扁平化边：外部源 -> 内部目标
          flattenedEdges.push({
            ...incomingEdge, // 保留原始边的属性 (ID 可能需要重新生成)
            id: `${incomingEdge.id}_flat_${internalEdge.target}`, // 生成更唯一的 ID
            target: internalEdge.target, // 重定向到内部节点 ID
            targetHandle: internalEdge.targetHandle, // 使用内部节点的句柄
          });
          console.debug(`[Flatten NodeGroup ${node.id}] Mapping incoming edge ${incomingEdge.id} (targetHandle: ${targetHandle}) to internal edge ${internalEdge.id} (target: ${internalEdge.target}, targetHandle: ${internalEdge.targetHandle}). New flat edge ID: ${incomingEdge.id}_flat_${internalEdge.target}`);
          // 从队列中移除已处理的边
          const index = edgeQueue.findIndex(e => e.id === incomingEdge.id);
          if (index > -1) edgeQueue.splice(index, 1);
        } else {
          console.warn(`[Flatten NodeGroup ${node.id}] No internal edge found originating from GroupInput ${internalGroupInput?.id} handle ${targetHandle} for NodeGroup ${node.id} input ${targetHandle}`);
        }
      }

      // 映射从 NodeGroup 输出出发的边
      const outgoingEdges = edgeQueue.filter(edge => edge.source === node.id);
      for (const outgoingEdge of outgoingEdges) {
        const sourceHandle = outgoingEdge.sourceHandle; // NodeGroup 上的输出句柄 (对应 interfaceOutputs key)
        if (!sourceHandle || !internalGroupOutput) continue;

        // 找到连接到内部 GroupOutput 对应输入句柄的边
        const internalEdge = flattenedSubWorkflow.edges.find(
          subEdge => subEdge.target === internalGroupOutput.id && subEdge.targetHandle === sourceHandle
        );
        if (internalEdge) {
          // 获取内部源节点
          const internalSourceNode = internalNodesMap.get(internalEdge.source);
          if (!internalSourceNode) {
            console.warn(`[Flatten] Internal source node ${internalEdge.source} not found for edge ${internalEdge.id}`);
            continue;
          }
          // 创建新的扁平化边：内部源 -> 外部目标
          flattenedEdges.push({
            ...outgoingEdge, // 保留原始边的属性 (ID 可能需要重新生成)
            id: `${outgoingEdge.id}_flat_${internalEdge.source}`, // 生成更唯一的 ID
            source: internalEdge.source, // 重定向到内部节点 ID
            sourceHandle: internalEdge.sourceHandle, // 使用内部节点的句柄
          });
          console.debug(`[Flatten NodeGroup ${node.id}] Mapping outgoing edge ${outgoingEdge.id} (sourceHandle: ${sourceHandle}) to internal edge ${internalEdge.id} (source: ${internalEdge.source}, sourceHandle: ${internalEdge.sourceHandle}). New flat edge ID: ${outgoingEdge.id}_flat_${internalEdge.source}`);
          // 从队列中移除已处理的边
          const index = edgeQueue.findIndex(e => e.id === outgoingEdge.id);
          if (index > -1) edgeQueue.splice(index, 1);
        } else {
          console.warn(`[Flatten NodeGroup ${node.id}] No internal edge found targeting GroupOutput ${internalGroupOutput?.id} handle ${sourceHandle} for NodeGroup ${node.id} output ${sourceHandle}`);
        }
      }

      // 将子流的扁平化节点（除IO节点）和边添加到结果中
      // 使用带命名空间的类型
      flattenedNodes.push(...flattenedSubWorkflow.nodes.filter(n => getNodeType(n) !== 'core:GroupInput' && getNodeType(n) !== 'core:GroupOutput'));
      // 子流内部的边（不涉及IO节点的）也需要添加
      flattenedEdges.push(...flattenedSubWorkflow.edges.filter(
        edge => {
          const sourceNode = internalNodesMap.get(edge.source);
          const targetNode = internalNodesMap.get(edge.target);
          // 使用带命名空间的类型
          const sourceIsIO = sourceNode && (getNodeType(sourceNode) === 'core:GroupInput' || getNodeType(sourceNode) === 'core:GroupOutput');
          // 使用带命名空间的类型
          const targetIsIO = targetNode && (getNodeType(targetNode) === 'core:GroupInput' || getNodeType(targetNode) === 'core:GroupOutput');
          return !sourceIsIO && !targetIsIO; // 只保留完全在内部的边
        }
      ));


      // 处理完成，从此递归路径移除标记
      processedGroupIds.delete(referencedWorkflowId);

    } else {
      // 普通节点，直接添加到结果
      flattenedNodes.push(node);
    }
  }

  // 处理剩余在队列中的边（这些是顶层图中未连接到任何 NodeGroup 的边）
  flattenedEdges.push(...edgeQueue);


  console.debug(`[Flatten END] internalId: ${internalId}. Returning ${flattenedNodes.length} nodes and ${flattenedEdges.length} edges.`);
  console.debug(`[Flatten END] Final nodes: ${flattenedNodes.map(n => `${n.id}(${getNodeType(n)})`).join(', ')}`);
  // console.debug(`[Flatten END] Final edges: ${flattenedEdges.map(e => `${e.id} (${e.source}:${e.sourceHandle} -> ${e.target}:${e.targetHandle})`).join(', ')}`);
  return { nodes: flattenedNodes, edges: flattenedEdges };
}