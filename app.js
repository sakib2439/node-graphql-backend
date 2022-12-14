require('dotenv').config()

const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const path = require('path')

const multer = require('multer')
const { v4: uuidv4 } = require('uuid')
const auth = require('./middlewares/auth')

const { clearImage } = require('./util/file')

const graphqlHttp = require('express-graphql').graphqlHTTP

const graphqlSchema = require('./graphql/schema')
const graphqlResolver = require('./graphql/resolvers')

const app = express()

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'images')
    },
    filename: function (req, file, cb) {
        cb(null, uuidv4())
    },
})

const fileFilter = (req, file, cb) => {
    if (
        file.mimetype === 'image/png' ||
        file.mimetype === 'image/jpg' ||
        file.mimetype === 'image/jpeg'
    ) {
        cb(null, true)
    } else {
        cb(null, false)
    }
}

// app.use(bodyParser.urlencoded()) // x-www-form-urlencoded <form>
app.use(bodyParser.json()) // application/json
app.use(multer({ storage: storage, fileFilter: fileFilter }).single('image'))

app.use('/images', express.static(path.join(__dirname, 'images')))

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE',
        'OPTIONS'
    )
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200)
    }
    next()
})

app.use(auth)

app.use('/feed/post-image', (req, res, next) => {
    if (!req.isAuth) {
        throw new Error('Not authenticated')
    }
    if (!req.file) {
        return res.status(200).json({ message: 'No file provided!' })
    }
    if (req.body.oldPath) {
        clearImage(req.body.oldPath)
    }
    return res
        .status(201)
        .json({ message: 'File stored.', filePath: req.file.path })
})

app.use(
    '/graphql',
    graphqlHttp({
        schema: graphqlSchema,
        rootValue: graphqlResolver,
        graphiql: true,
        customFormatErrorFn(err) {
            if (!err.originalError) {
                return err
            }
            const data = err.originalError.data
            const message = err.message || 'An error occurred.'
            const code = err.originalError.code || 500
            return { message: message, status: code, data: data }
        },
    })
)

app.use((error, req, res, next) => {
    console.log(error)
    const status = error.statusCode || 500
    const message = error.message
    res.status(status).json({ message: message })
})

mongoose
    .connect(process.env.MONGODB_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(result => {
        const port = process.env.PORT || 8080
        const server = app.listen(port, () => {
            console.log(`...Listening on port ${port}`)
        })
    })
    .catch(err => console.log(err))
