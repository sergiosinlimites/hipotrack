const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'StreamSession',
  tableName: 'stream_sessions',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    started_at: {
      type: 'timestamptz',
      nullable: false,
    },
    ended_at: {
      type: 'timestamptz',
      nullable: true,
    },
    initiated_by: {
      type: String,
      nullable: true,
    },
    video_path: {
      type: String,
      nullable: true,
    },
    frame_count: {
      type: Number,
      default: 0,
    },
    bytes_sent: {
      type: 'bigint',
      default: 0,
    },
    status: {
      type: String,
      default: 'active',
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


