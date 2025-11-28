const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'Photo',
  tableName: 'photos',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    image_path: {
      type: String,
    },
    thumbnail_path: {
      type: String,
      nullable: true,
    },
    trigger_source: {
      type: String,
      nullable: true,
    },
    captured_at: {
      type: 'timestamptz',
      nullable: false,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    camera: {
      type: 'many-to-one',
      target: 'Camera',
      joinColumn: {
        name: 'camera_id',
      },
      onDelete: 'CASCADE',
      nullable: false,
    },
  },
});


