import "./style.css";
import React, { useState, useCallback } from "react";
import { render } from "react-dom";
import { hot } from "react-hot-loader";

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type ConnectionMap = {
  [key: string]: string;
};
type Item = {
  id?: string;
  value?: string;
  connections?: ConnectionMap;
};

// Data

const ValueDBMap = {};
const ConnectionDBMap = {};

// Get/Set

const getValue = id => ValueDBMap[id];
const setValue = (id, value: any) => {
  if (typeof value === "undefined") {
    delete ValueDBMap[id];
  } else {
    ValueDBMap[id] = value;
  }
};

// Connections

const getConnectionMap = (itemId): ConnectionMap =>
  ConnectionDBMap[itemId] || {};
const setConnection = (itemId, fromId, toId) => {
  ConnectionDBMap[itemId] = ConnectionDBMap[itemId] || {};

  if (ValueDBMap.hasOwnProperty(fromId)) {
    if (typeof toId === "undefined") {
      delete ConnectionDBMap[itemId][fromId];
    } else if (ValueDBMap.hasOwnProperty(toId)) {
      ConnectionDBMap[itemId][fromId] = toId;
    }
  }
};
const setConnectionsFromMap = (itemId, connections: ConnectionMap = {}) => {
  for (const k in connections) {
    setConnection(itemId, k, connections[k]);
  }
};
const deleteConnections = itemId => {
  delete ConnectionDBMap[itemId];
};

// Items

const createItem = (value: string): Item => {
  const id = uuidv4();

  setValue(id, value);

  return {
    id,
    value,
    connections: {}
  };
};
const readItem = (id): Item => ({
  id,
  value: getValue(id),
  connections: getConnectionMap(id)
});
const getConnectedItems = (id): Item[] => {
  const connectionMap = getConnectionMap(id);
  const connectedItems = [];

  for (const k in connectionMap) {
    connectedItems.push(readItem(k));
  }

  return connectedItems;
};
const updateItem = ({ id, value, connections }: Item = {}) => {
  if (id) {
    if (typeof value !== "undefined") {
      setValue(id, value);
    }

    setConnectionsFromMap(id, connections);
  }
};
const deleteItem = id => {
  setValue(id, undefined);
  deleteConnections(id);
};

// Smelted Objects

type SmeltedObject = {
  id?: string;
  [keys: string]: string;
};
type SmeltedObjectConnectionMap = {
  [key: string]: string | string[];
};

const createObject = (
  obj: SmeltedObject,
  tags: string[] = [new Date().toISOString()]
) => {
  const tagString = tags.join("\n");
  const { id } = createItem(tagString);

  for (const k in obj) {
    const value = obj[k];
    const { id: keyId } = createItem(k);
    const { id: valueId } = createItem(value);

    setConnection(id, keyId, valueId);
  }

  return {
    ...obj,
    id
  };
};
const relateObjects = (
  objectId: string,
  connectionMap: SmeltedObjectConnectionMap = {}
) => {
  for (const relationalFieldName in connectionMap) {
    const idOrIdList = connectionMap[relationalFieldName];
    const { id: relationalFieldItemId } = createItem(relationalFieldName);
    const relationalFieldItemConnectionMap = {};

    if (idOrIdList instanceof Array) {
      for (const idInList of idOrIdList) {
        relationalFieldItemConnectionMap[idInList] = idInList;
      }
    } else if (typeof idOrIdList === "string") {
      relationalFieldItemConnectionMap[idOrIdList] = idOrIdList;
    }

    updateItem({
      id: objectId,
      connections: {
        [relationalFieldItemId]: relationalFieldItemId
      }
    });
    updateItem({
      id: relationalFieldItemId,
      connections: relationalFieldItemConnectionMap
    });
  }
};
const unrelateObjects = (
  objectId: string,
  connectionMap: SmeltedObjectConnectionMap = {}
) => {
  const obj = readObject(objectId);

  for (const relationalFieldName in connectionMap) {
    const idOrIdList = connectionMap[relationalFieldName];
    const relationalFieldItemId = obj[relationalFieldName];
    const relationalFieldItemConnectionMap = {};

    if (idOrIdList instanceof Array) {
      const connectionRemovalMap = {};

      for (const idInList of idOrIdList) {
        connectionRemovalMap[idInList] = undefined;

        updateItem({
          id: relationalFieldItemId,
          connections: connectionRemovalMap
        });
      }
    } else if (typeof idOrIdList === "string") {
      updateItem({
        id: objectId,
        connections: {
          [relationalFieldItemId]: undefined
        }
      });
      deleteItem(relationalFieldItemId);
    }
  }
};
const readObject = (id: string): SmeltedObject => {
  const { connections = {} } = readItem(id);
  const obj: SmeltedObject = {};

  for (const fromId in connections) {
    const toId = connections[fromId];
    const { value: k } = readItem(fromId);
    const { value } = readItem(toId);

    obj[k] = value;
  }

  obj.id = id;

  return obj;
};
const getObjectValueItemIdMap = (
  objectId: string
): { [key: string]: string } => {
  const { connections = {} } = readItem(objectId);
  const map = {};

  for (const fromId in connections) {
    const toId = connections[fromId];
    const { value: keyName } = readItem(fromId);

    map[keyName] = toId;
  }

  return map;
};
const updateObject = (obj: SmeltedObject) => {
  const { id, ...other } = obj;
  const objectValueItemIdMap = getObjectValueItemIdMap(id);

  for (const k in obj) {
    const value = obj[k];
    const valueId = objectValueItemIdMap[k];

    if (!!valueId) {
      updateItem({
        id: valueId,
        value
      });
    } else {
      const { id: keyId } = createItem(k);
      const { id: valueId } = createItem(value);

      setConnection(id, keyId, valueId);
    }
  }
};

// **********
// Input/Output
// **********

const App = () => {
  const [v, setV] = useState("");
  const onSubmit = useCallback(
    e => {
      const newValue = e.target.v.value;

      e.preventDefault();

      createItem(newValue);

      setV(newValue);

      e.target.reset();
    },
    [v, setV]
  );
  const onDelete = useCallback(
    e => {
      deleteItem(e.target.dataset.itemId);

      setV("");
    },
    [v, setV]
  );

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input defaultValue="" name="v" />
        <button type="submit">Add</button>
        <br />
        {Object.keys(ValueDBMap).map(k => (
          <div key={`Item:${k}`} data-item-id={k} onClick={onDelete}>
            {ValueDBMap[k]}
          </div>
        ))}
      </form>
    </div>
  );
};

const appDiv: HTMLElement = document.getElementById("root");

render(<App />, appDiv);
