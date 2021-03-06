import { PrismaClient } from '@prisma/client'
import { GraphQLServer } from 'graphql-yoga'
import { makeSchema, mutationType, objectType, queryType } from 'nexus'
import { nexusPrismaPlugin } from 'nexus-prisma'
import * as path from 'path'

const prisma = new PrismaClient({ debug: true })

new GraphQLServer({
  context: () => ({ prisma }),
  schema: makeSchema({
    typegenAutoConfig: {
      contextType: '{ prisma: PrismaClient.PrismaClient }',
      sources: [{ source: '@prisma/client', alias: 'PrismaClient' }],
    },
    outputs: {
      typegen: path.join(
        __dirname,
        'node_modules/@types/nexus-typegen/index.d.ts',
      ),
    },
    plugins: [nexusPrismaPlugin()],
    types: [
      queryType({
        definition(t) {
          t.crud.fooBars()
          t.crud.user()
          t.crud.users({ ordering: true })
          t.crud.post()
          t.crud.posts({ filtering: true })
        },
      }),
      mutationType({
        definition(t) {
          t.crud.createOneUser()
          t.crud.createOnePost()
          t.crud.deleteOneUser()
          t.crud.deleteOnePost()
        },
      }),
      objectType({
        name: 'FooBar',
        definition(t) {
          t.model.id()
        },
      }),
      objectType({
        name: 'User',
        definition(t) {
          t.model.id()
          t.model.email()
          t.model.birthDate()
          t.model.posts()
        },
      }),
      objectType({
        name: 'Post',
        definition(t) {
          t.model.id()
          t.model.author()
        },
      }),
    ],
  }),
}).start(() => console.log(`🚀 GraphQL service ready at http://localhost:4000`))
