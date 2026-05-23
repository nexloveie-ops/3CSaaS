import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  displayName!: string;

  @Prop({ default: 'en' })
  locale!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false })
  isSuperAdmin!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
