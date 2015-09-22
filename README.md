RAML JSON Schema Expander
============

### Purpose
This library will expand JSON Schema draft 4 schema references in a ramlObject created by raml2obj.
It was primarily created for use in raml2html so that schemas which reference other schemas will be expanded istead of leaving "$ref": "foo.json#" or "$ref": "#reference".

### Usage
Currently you will need to use the ms-sfm fork of raml2html.

    git clone git@github.com:ms-sfm/raml2html.git
    npm install
    raml2html/bin/raml2html -o Output.html Input.raml

In case of local modifications to raml-jsonschema-expander, use npm link to use the local raml-jsonschema-expander in raml2html.

### JSONSchema Requirements
This fork of raml-jsonschema-expander does not require the JSON schema files to be hosted on a webserver.
Instead, it resolves $ref links by inspected JSON schemas that have been declared in RAML. This facilitates
more flexible object re-use.
Your JSON Schema objects must also have an id attribute with the canonical URL for that file.
The library will use canonical dereferencing http://json-schema.org/draft-04/schema# to pull the referenced file and replace the reference with the contents of that file.

This will happen recursively for all referenced files. There is no cycle checking, it may run until it causes a stack overflow if there is a cycle. It will only fetch the file from the Internet once per run to prevent repetitive network traffic so that stack overflow should come quickly at least.

This extension to raml-jsonschema-expander is best illustrated with an example.
It all starts with an RAML file:

    #%RAML 0.8
    title: Example
    version: v1

    baseUri: http://your.domain.here/

    schemas:
        - JsonBook:  !include schema/Book.json
        - JsonBooks: !include schema/Books.json

    /book:
        get:
            description: Retrieve one book
            responses:
                200:
                    body:
                        application/json:
                            schema: JsonBook
    /books:
        get:
            description: Retrieve a set of books
            responses:
                200:
                    body:
                        application/json:
                            schema: JsonBooks

The RAML file above links in two JSON schemas that define a Book and a set of Books.
So for so good. Book.json is a straightforward:

    {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "id": "#JsonBook",
        "type": "object",
        "description": "A book",
        "properties": {
            "title": {
                "type": "string"
            },
            "author": {
                "type": "string"
            }
        }
    }

Now in Books.json, we reference a Book using "$ref": "#JsonBook":

    {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "id": "#JsonBooks",
        "type": "object",
        "description": "Set of Books",
        "properties": {
            "books": {
                "type": "array",
                "items": {
                    "$ref": "#JsonBook"
                }
            }
        }
    }

Notice that in the reference we use #JsonBook. The entry JsonBook does not exist as a file. It however is declared in the RAML file:

    - JsonBook:  !include schema/Book.json

This is the declaration of the schema that will be used a anchor for references to JsonBook.
It does require that schemas are not circular in definition and that declarations of schemas always are placed before the first reference.


The original behaviour is left untouched.
Example file events.json is a collection of event objects which must be hosted in a path relative from "$ref" to the URL described in "id" excluding the events.json part:

    {
      "$schema": "http://json-schema.org/draft-04/schema#",
      "id": "http://yourserver.example.com/path/to/schemas/events.json#",
      "type": "object",
      "description": "Collection of events",
      "properties": {
        "events": {
          "type": "array",
          "items": {
            "$ref": "event.json#"
          }
        },
        "deletions": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "guid"
          },
          "description": "array of guids for items that were deleted since last sync."
        }
      }
    }

Example file event.json:

    {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "id": "http://yourserver.example.com/path/to/schemas/event.json#",
        "type": "object",
        "description": "An event record",
        "properties": {
          "guid": { "type": "string", "format": "guid" },
          "lastModified": { "type": "string", "format": "iso8601" },
          "eventStartDate": { "type": "string", "format": "iso8601" },
          "eventEndDate": { "type": "string", "format": "iso8601" }
        }
    }