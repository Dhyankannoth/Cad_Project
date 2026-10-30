"use client"

import { TreeView, createTreeCollection } from "@chakra-ui/react"
import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import { LuFile, LuFolder } from "react-icons/lu"

export const TreeViewDemo = ({ collection: customCollection, onSelect }) => {
  const activeCollection = customCollection || collection;
  
  return (
    <ChakraProvider value={defaultSystem}>
      <div className="chakra-dark-wrapper" data-theme="dark">
        <TreeView.Root collection={activeCollection} maxW="full">
        <TreeView.Label className="tree-label">Project Files</TreeView.Label>
        <TreeView.Tree className="tree-container">
          <TreeView.Node
            indentGuide={<TreeView.BranchIndentGuide />}
            render={({ node, nodeState }) =>
              nodeState.isBranch ? (
                <TreeView.BranchControl 
                  className="tree-branch"
                  onClick={() => onSelect?.(node, true)}
                >
                  <LuFolder />
                  <TreeView.BranchText>{node.name}</TreeView.BranchText>
                </TreeView.BranchControl>
              ) : (
                <TreeView.Item 
                  className="tree-item"
                  onClick={() => onSelect?.(node, false)}
                >
                  <LuFile />
                  <TreeView.ItemText>{node.name}</TreeView.ItemText>
                </TreeView.Item>
              )
            }
          />
        </TreeView.Tree>
      </TreeView.Root>
    </div>
    </ChakraProvider>
  )
}

interface Node {
  id: string
  name: string
  children?: Node[]
}

const collection = createTreeCollection<Node>({
  nodeToValue: (node) => node.id,
  nodeToString: (node) => node.name,
  rootNode: {
    id: "ROOT",
    name: "",
    children: [
      {
        id: "node_modules",
        name: "node_modules",
        children: [
          { id: "node_modules/zag-js", name: "zag-js" },
          { id: "node_modules/pandacss", name: "panda" },
          {
            id: "node_modules/@types",
            name: "@types",
            children: [
              { id: "node_modules/@types/react", name: "react" },
              { id: "node_modules/@types/react-dom", name: "react-dom" },
            ],
          },
        ],
      },
      {
        id: "src",
        name: "src",
        children: [
          { id: "src/app.tsx", name: "app.tsx" },
          { id: "src/index.ts", name: "index.ts" },
        ],
      },
      { id: "panda.config", name: "panda.config.ts" },
      { id: "package.json", name: "package.json" },
      { id: "renovate.json", name: "renovate.json" },
      { id: "readme.md", name: "README.md" },
    ],
  },
})
