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
  [keys: string]: string | SmeltedObject;
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
    const { id: valueId } = createItem(value as string);

    setConnection(id, keyId, valueId);
  }

  return {
    ...obj,
    id
  };
};
const getObjectValueItemIdMap = (
  objectId: string
): { [key: string]: string } => {
  const { connections = {} } = readItem(objectId);
  const map = {};

  for (const fromId in connections) {
    const toId = connections[fromId];

    // TRICKY: Check to see if this is a relationship connection or a key/value connection.
    // IMPORTANT: Omit relationship connections.
    if (toId !== fromId) {
      // This is a key/value connection.
      const { value: keyName } = readItem(fromId);

      map[keyName] = toId;
    }
  }

  return map;
};
const relateObjects = (
  objectId: string,
  connectionMap: SmeltedObjectConnectionMap = {}
) => {
  const objectValueItemIdMap = getObjectValueItemIdMap(objectId);

  for (const relationalFieldName in connectionMap) {
    // IMPORTANT: Ensure that this is not a key/value field.
    if (!objectValueItemIdMap.hasOwnProperty(relationalFieldName)) {
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
  }
};
const getObjectRelationalFieldItemIdMap = (
  objectId: string,
  fieldMap?: { [keys: string]: boolean }
): { [key: string]: string } => {
  const { connections = {} } = readItem(objectId);
  const map = {};

  for (const fromId in connections) {
    const toId = connections[fromId];

    // TRICKY: Check to see if this is a relationship connection or a key/value connection.
    // IMPORTANT: Omit key/value connections.
    if (toId === fromId) {
      // This is a relationship connection.
      const { value: keyName } = readItem(fromId);

      if (!fieldMap || fieldMap.hasOwnProperty(keyName)) {
        map[keyName] = toId;
      }
    }
  }

  return map;
};
const unrelateObjects = (
  objectId: string,
  connectionMap: SmeltedObjectConnectionMap = {}
) => {
  const obj = readObject(objectId);
  const objectRelationalFieldItemIdMap = getObjectRelationalFieldItemIdMap(
    objectId
  );

  for (const relationalFieldName in connectionMap) {
    // IMPORTANT: Ensure that this is not a key/value field.
    if (objectRelationalFieldItemIdMap.hasOwnProperty(relationalFieldName)) {
      const idOrIdList = connectionMap[relationalFieldName];
      const relationalFieldItemId = obj[relationalFieldName];
      const relationalFieldItemConnectionMap = {};

      let removeRelationalFieldItem = false;

      if (idOrIdList instanceof Array) {
        const connectionRemovalMap = {};

        for (const idInList of idOrIdList) {
          connectionRemovalMap[idInList] = undefined;

          updateItem({
            id: relationalFieldItemId as string,
            connections: connectionRemovalMap
          });

          const { connections: remainingConnections = {} } = readItem(
            relationalFieldItemId
          );
          const remainingConnectionKeys = Object.keys(remainingConnections);

          if (remainingConnectionKeys.length < 1) {
            removeRelationalFieldItem = true;
          }
        }
      } else if (typeof idOrIdList === "string") {
        removeRelationalFieldItem = true;
      }

      if (removeRelationalFieldItem) {
        updateItem({
          id: objectId,
          connections: {
            [relationalFieldItemId as string]: undefined
          }
        });
        deleteItem(relationalFieldItemId);
      }
    }
  }
};
const getRelatedObjects = (
  objectId: string,
  fieldMap: { [key: string]: boolean } = {}
): { [key: string]: SmeltedObject[] } => {
  const objectRelationalFieldItemIdMap = getObjectRelationalFieldItemIdMap(
    objectId,
    fieldMap
  );
  const relatedObjectMap = {};

  for (const relationalFieldName in objectRelationalFieldItemIdMap) {
    const relationalFieldItemId =
      objectRelationalFieldItemIdMap[relationalFieldName];
    const { connections: relationalConnectionMap = {} } = readItem(
      relationalFieldItemId
    );

    const relatedItemList = [];

    for (const relatedItemId in relationalConnectionMap) {
      relatedItemList.push(readObject(relatedItemId));
    }

    relatedObjectMap[relationalFieldName] = relatedItemList;
  }

  return relatedObjectMap;
};
const readObject = (id: string): SmeltedObject => {
  const { connections = {} } = readItem(id);
  const obj: SmeltedObject = {};

  for (const fromId in connections) {
    const toId = connections[fromId];

    // IMPORTANT: Ensure that relational fields are not beeing read.
    if (toId !== fromId) {
      const { value: k } = readItem(fromId);
      const { value } = readItem(toId);

      obj[k] = value;
    }
  }

  obj.id = id;

  return obj;
};
const updateObject = (obj: SmeltedObject) => {
  const { id, ...other } = obj;
  const objectValueItemIdMap = getObjectValueItemIdMap(id);
  const objectRelationalFieldItemIdMap = getObjectRelationalFieldItemIdMap(id);

  for (const k in obj) {
    const value = obj[k] as string;
    const valueId = objectValueItemIdMap[k];

    if (!!valueId) {
      updateItem({
        id: valueId,
        value
      });
    } else if (
      // IMPORTANT: Ensure that this is not a relational field.
      !objectRelationalFieldItemIdMap.hasOwnProperty(k)
    ) {
      const { id: keyId } = createItem(k);
      const { id: valueId } = createItem(value);

      setConnection(id, keyId, valueId);
    }
  }
};
const deleteObject = (objectId: string) => {
  const { connections = {} } = readItem(objectId);

  for (const fromId in connections) {
    const toId = connections[fromId];

    deleteItem(fromId);
    deleteItem(toId);
  }

  deleteItem(objectId);
};

// **********
// Input/Output
// **********

interface Address extends SmeltedObject {
  streetNumber: string;
  streetName: string;
  city: string;
  state: string;
  zip: string;
}

interface Contact extends SmeltedObject {
  firstName: string;
  lastName: string;
  address?: Address;
}

const App = () => {
  const [v, setV]: [{ [key: string]: string }, Function] = useState({});
  const onSubmit = useCallback(
    e => {
      e.preventDefault();

      const {
        target: {
          firstName,
          lastName,
          streetNumber,
          streetName,
          city,
          state,
          zip
        }
      } = e;
      const contact: Contact = {
        firstName: firstName.value,
        lastName: lastName.value
      };
      const address: Address = {
        streetNumber: streetNumber.value,
        streetName: streetName.value,
        city: city.value,
        state: state.value,
        zip: zip.value
      };
      const { id: contactId } = createObject(contact as SmeltedObject);
      const { id: addressId } = createObject(address);
      const newValue = {
        ...v,
        [contactId]: contactId
      };

      relateObjects(contactId, { address: addressId });

      setV(newValue);

      e.target.reset();
    },
    [v, setV]
  );
  const onDelete = useCallback(
    e => {
      const objectId = e.currentTarget.dataset.itemId as string;
      const { [objectId]: removedId, ...other } = v;

      setV(other);
    },
    [v, setV]
  );
  const contactObjectList: Contact[] = Object.keys(v).map(
    cId =>
      ({
        ...readObject(cId),
        address: getRelatedObjects(cId, { address: true }).address[0]
      } as Contact)
  );

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input defaultValue="Ryan" name="firstName" placeholder="First Name" />
        <input
          defaultValue={uuidv4()}
          name="lastName"
          placeholder="Last Name"
        />
        <input
          defaultValue="44"
          name="streetNumber"
          placeholder="Street Number"
        />
        <input
          defaultValue="Junk Bot Dr."
          name="streetName"
          placeholder="Street Name"
        />
        <input defaultValue="Large Soda" name="city" placeholder="City" />
        <input defaultValue="CA" name="state" placeholder="State" />
        <input defaultValue="09243" name="zip" placeholder="Zip" />
        <button type="submit">Add</button>
      </form>
      {contactObjectList.length ? <br /> : undefined}
      {contactObjectList.map(
        ({
          id,
          firstName,
          lastName,
          address: { streetNumber, streetName, city, state, zip }
        }) => (
          <div key={`Contact:${id}`} data-item-id={id} onClick={onDelete}>
            {firstName} {lastName}
            <br />
            <small>
              {streetNumber} {streetName}
              <br />
              {city} {state} {zip}
            </small>
          </div>
        )
      )}
      {contactObjectList.length ? <br /> : undefined}
      <pre>
        {JSON.stringify(ValueDBMap, null, "  ")}
        <br />
        <br />
        {JSON.stringify(ConnectionDBMap, null, "  ")}
      </pre>
    </div>
  );
};

const appDiv: HTMLElement = document.getElementById("root");

render(<App />, appDiv);
