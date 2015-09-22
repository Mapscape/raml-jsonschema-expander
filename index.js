'use strict';

var urllibSync = require('urllib-sync');

var schemaHttpCache = {};
var expandedSchemaCache = {};

function expandJsonSchemas(ramlObj) {
    for (var schemaIndex in ramlObj.schemas) {
        var schema = ramlObj.schemas[schemaIndex];
        for (var objectKeyIndex in Object.keys(schema)) {
            var objectKey = Object.keys(schema)[objectKeyIndex];

            var schemaText = schema[objectKey];
            if (isJsonSchema(schemaText)) {
                // Only try to expand JSON Schema documents, not e.g. XML schemas
                schemaText = expandSchema(schemaText);
                expandedSchemaCache[objectKey] = JSON.parse(schemaText);

                ramlObj.schemas[schemaIndex][objectKey] = schemaText;
            }
        }
    }

    for (var resourceIndex in ramlObj.resources) {
        var resource = ramlObj.resources[resourceIndex];
        ramlObj.resources[resourceIndex] = fixSchemaNodes(resource);
    }

    return ramlObj;
}

/**
 *  Walk through the hierarchy provided and replace schema nodes with expanded schema.
 */
function fixSchemaNodes(node) {
    var keys = Object.keys(node);
    for (var keyIndex in keys) {
        var key = keys[keyIndex];
        var value = node[key];
        if (key === "schema" && isJsonSchema(value)) {
            var expandedObj;
            var schemaObj = JSON.parse(value);
            if (schemaObj.id && schemaObj.id in expandedSchemaCache) {
                // Do a lookup of URI references
                expandedObj = expandedSchemaCache[schemaObj.id];
            } else  if (schemaObj.id &&
                        (schemaObj.id.charAt(0) == '#') &&
                        (schemaObj.id.substr(1) in expandedSchemaCache)) {
                // As fallback do a lookup up of a #-reference
                expandedObj = expandedSchemaCache[schemaObj.id.substr(1)];
            }
            if (expandedObj) {
                node[key] = JSON.stringify(expandedObj, null, 2);
            }
        } else if (isObject(value)) {
            node[key] = fixSchemaNodes(value);
        } else if (isArray(value)) {
            node[key] = fixSchemaNodesInArray(value);
        }
    }
    return node;
}

function fixSchemaNodesInArray(value) {
    for (var i in value) {
        var element = value[i];
        if (isObject(element)) {
            value[i] = fixSchemaNodes(element);
        }
    }
    return value;
}

function expandSchema(schemaText) {
    if (schemaText.indexOf("$ref") > 0 && isJsonSchema(schemaText)) {
        var schemaObject = JSON.parse(schemaText);
        if (schemaObject.id) {
            var basePath = getBasePath(schemaObject.id);
            var expandedSchema = walkTree(basePath, schemaObject);
            return JSON.stringify(expandedSchema);
        } else {
            return schemaText;
        }
    }
    return schemaText;
}

/**
 * Walk the tree hierarchy until a ref is found. Download the ref and expand it as well in its place.
 * Return the modified node with the expanded reference.
 */
function walkTree(basePath, node) {
    var keys = Object.keys(node);
    for (var keyIndex in keys) {
        var key = keys[keyIndex];
        var value = node[key];
        if (key === "$ref") {
            var expandedRef;
            if (value === "#") {

                //Avoid recursively expanding, do nothing
            } else if ((value.charAt(0) == '#') &&
                       (value.substr(1) in expandedSchemaCache)) {
                //Node has a ref, create expanded ref in its place.
                expandedRef = expandedSchemaCache[value.substr(1)];
            } else {
                //Node has a ref, create expanded ref in its place.
                expandedRef = expandRef(basePath, value);
                delete node["$ref"];
            }

            if (expandedRef) {
                //Merge an expanded ref into the node
                //The original $ref attribute is removed since it will be replaced by a document
                delete node["$ref"];
                mergeObjects(node, expandedRef);
                //Any present $schema and id attributes should no longer be in the (sub) document to make the complete document well formed
                delete node["$schema"];
                delete node["id"];
            }

        } else if (isObject(value)) {
            node[key] = walkTree(basePath, value);
        } else if (isArray(value)) {
            node[key] = walkArray(basePath, value);
        }
    }

    return node;
}

function mergeObjects(destination, source) {
    for (var attrname in source) { destination[attrname] = source[attrname]; }
}

function expandRef(basePath, value) {
    var refUri = basePath + "/" + value;
    var refText = fetchRef(refUri);
    var refObject = JSON.parse(refText);
    var newBasePath;
    if (refObject.id) {
        newBasePath = getBasePath(refObject.id);
    } else {
        newBasePath = basePath;
    }
    return walkTree(newBasePath, refObject);
}

function fetchRef(refUri) {
    if (refUri in schemaHttpCache) {
        return schemaHttpCache[refUri];
    } else {
        var request = urllibSync.request;
        var response = request(refUri, { timeout: 30000 });
        if (response.status == 200) {
            schemaHttpCache[refUri] = response.data;
        }
        return response.data;
    }
}

function walkArray(basePath, value) {
    for (var i in value) {
        var element = value[i];
        if (isObject(element)) {
            value[i] = walkTree(basePath, element);
        }
    }
    return value;
}

function isObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}

function isArray(value) {
    return Object.prototype.toString.call(value) === "[object Array]";
}

function getBasePath(path) {
    var identityPath = path.split('/');
    identityPath.pop();
    return identityPath.join('/');
}

function isJsonSchema(schemaText) {
    return (schemaText.indexOf("http://json-schema.org/draft-04/schema") > 0);
}

module.exports = {
  expandJsonSchemas: expandJsonSchemas
};

if (require.main === module) {
  console.log('This script is meant to be used as a library. You probably want to run bin/raml-jsonschema-expander if you\'re looking for a CLI.');
  process.exit(1);
}
